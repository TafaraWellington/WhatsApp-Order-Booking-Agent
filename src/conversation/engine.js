/**
 * Conversation Engine.
 *
 * This is the central state machine. For every incoming WhatsApp message it:
 *   1. Loads (or creates) the sender's session from SQLite.
 *   2. Normalises the input (text vs interactive reply).
 *   3. Dispatches to the correct step handler.
 *   4. Persists the updated session step + context.
 *   5. Emits SSE events for the dashboard on new orders/bookings.
 *
 * Session context is stored as JSON in sessions.context_json.
 * SSE broadcast is done via the emitter exported from app.js.
 */

const db = require('../db');
const wa = require('./whatsapp');
const { sendWelcome, routeMainMenu, sendHelp, getBusiness } = require('./steps/welcome');
const { sendMenu } = require('./steps/menu');
const {
  startOrder,
  handleItemSelected,
  sendOrderConfirmation,
  placeOrder,
} = require('./steps/order');
const {
  sendServices,
  resolveService,
  askForDate,
  parseDate,
  sendTimeSlots,
  sendBookingConfirmation,
  placeBooking,
} = require('./steps/booking');

const BUSINESS_TYPE = process.env.BUSINESS_TYPE || 'salon';

// SSE emitter (set by app.js after it's created)
let _sseEmitter = null;
function setSseEmitter(emitter) {
  _sseEmitter = emitter;
}

// ── Session helpers ──────────────────────────────────────────────

async function getSession(sender) {
  let row = await db('sessions').where({ wa_sender: sender }).first();
  if (!row) {
    await db('sessions').insert({ wa_sender: sender, step: 'START', context_json: '{}' });
    row = await db('sessions').where({ wa_sender: sender }).first();
  }
  return {
    step: row.step,
    ctx: JSON.parse(row.context_json || '{}'),
  };
}

async function saveSession(sender, step, ctx) {
  await db('sessions')
    .where({ wa_sender: sender })
    .update({ step, context_json: JSON.stringify(ctx), updated_at: new Date().toISOString() });
}

// ── Input normalisation ──────────────────────────────────────────

/**
 * Normalise a raw WhatsApp message object into { kind, value }.
 *   kind = 'text'  → free-text, value = lowercased text
 *   kind = 'id'    → interactive reply, value = the reply ID string
 */
function normalise(msg) {
  if (!msg) return { kind: 'text', value: '' };

  if (msg.type === 'text') {
    return { kind: 'text', value: (msg.text?.body || '').trim().toLowerCase() };
  }
  if (msg.type === 'interactive') {
    if (msg.interactive?.type === 'list_reply') {
      return { kind: 'id', value: msg.interactive.list_reply.id };
    }
    if (msg.interactive?.type === 'button_reply') {
      return { kind: 'id', value: msg.interactive.button_reply.id };
    }
  }
  return { kind: 'text', value: '' };
}

/**
 * True if the input matches a "go back to main menu" keyword.
 */
function isMenuTrigger(input) {
  return ['menu', 'hi', 'hello', 'hey', 'hie', 'start', '0', 'back'].includes(input.value);
}

// ── Main dispatcher ──────────────────────────────────────────────

/**
 * Process one inbound message.
 *
 * @param {string} sender      - E.164 WhatsApp number
 * @param {string} senderName  - Display name from profile
 * @param {object} message     - Raw message object from Meta webhook
 */
async function handleMessage(sender, senderName, message) {
  const input = normalise(message);
  let { step, ctx } = await getSession(sender);
  const business = await getBusiness();
  const businessId = business?.id;

  // ── Global escape hatch: any "menu" keyword resets to MAIN_MENU ──
  if (step !== 'START' && isMenuTrigger(input)) {
    await sendWelcome(sender);
    await saveSession(sender, 'MAIN_MENU', {});
    return;
  }

  // ── Step machine ─────────────────────────────────────────────────
  switch (step) {

    // ── Initial contact ──────────────────────────────────────────
    case 'START':
    case 'MAIN_MENU': {
      await sendWelcome(sender);
      await saveSession(sender, 'MAIN_MENU', {});

      // If there was a meaningful button tap, route immediately
      if (input.kind === 'id' || (input.kind === 'text' && !isMenuTrigger(input))) {
        const next = routeMainMenu(input.value);
        if (next) {
          await saveSession(sender, next, {});
          await handleMessage(sender, senderName, message); // re-dispatch
        }
      }
      break;
    }

    // ── Main menu options ────────────────────────────────────────
    case 'HELP': {
      await sendHelp(sender);
      await saveSession(sender, 'MAIN_MENU', {});
      break;
    }

    case 'MENU_VIEW': {
      await sendMenu(sender, businessId);
      await saveSession(sender, 'MAIN_MENU', {});
      break;
    }

    // ── Order flow (restaurant / spaza) ─────────────────────────
    case 'ORDER_START': {
      await startOrder(sender, businessId);
      await saveSession(sender, 'ORDER_ITEM', {});
      break;
    }

    case 'ORDER_ITEM': {
      const selId = input.value;

      // Cart flow shortcuts
      if (selId === 'cart_checkout' || selId === 'checkout' || selId === 'done') {
        if (!ctx.cart || ctx.cart.length === 0) {
          await wa.sendText(sender, '🛒 Your cart is empty! Please select an item first.');
          await startOrder(sender, businessId);
          break;
        }
        await sendOrderConfirmation(sender, ctx);
        await saveSession(sender, 'ORDER_CONFIRM', ctx);
        break;
      }

      if (selId === 'cart_add_more' || selId === 'add more') {
        await startOrder(sender, businessId);
        // stay in ORDER_ITEM
        await saveSession(sender, 'ORDER_ITEM', ctx);
        break;
      }

      if (selId.startsWith('order_item_')) {
        const { success, ctx: newCtx } = await handleItemSelected(sender, ctx, selId);
        await saveSession(sender, 'ORDER_ITEM', newCtx);
        break;
      }

      // Unknown input
      await wa.sendText(sender, '🛒 Please tap an item from the list, or tap *Checkout* when ready.');
      await startOrder(sender, businessId);
      break;
    }

    case 'ORDER_CONFIRM': {
      const v = input.value;
      if (v === 'order_confirm_yes' || v === 'yes' || v === 'confirm') {
        const { orderId } = await placeOrder(sender, senderName, ctx, businessId);
        _sseEmitter?.emit('new_order', { orderId, type: 'order', sender });
        await saveSession(sender, 'MAIN_MENU', {});
      } else if (v === 'order_confirm_no' || v === 'no' || v === 'cancel') {
        await wa.sendText(sender, '❌ Order cancelled. Type "menu" to start again.');
        await saveSession(sender, 'MAIN_MENU', {});
      } else {
        await sendOrderConfirmation(sender, ctx);
      }
      break;
    }

    // ── Booking flow (salon) ──────────────────────────────────────
    case 'SERVICE_SELECT': {
      await sendServices(sender, businessId);
      await saveSession(sender, 'BOOKING_SERVICE_CHOSEN', {});
      break;
    }

    case 'BOOKING_SERVICE_CHOSEN': {
      const selId = input.value;
      if (!selId.startsWith('svc_')) {
        await wa.sendText(sender, '💅 Please tap a service from the list above.');
        await sendServices(sender, businessId);
        break;
      }
      const service = await resolveService(selId);
      if (!service) {
        await wa.sendText(sender, '⚠️ That service is no longer available. Please choose another.');
        await sendServices(sender, businessId);
        break;
      }
      ctx.service = {
        id: service.id,
        name: service.name,
        price: Number(service.price),
        duration_mins: service.duration_mins || 60,
      };
      await askForDate(sender, service.name);
      await saveSession(sender, 'BOOKING_DATE', ctx);
      break;
    }

    case 'BOOKING_DATE': {
      const v = input.value;

      // Handle retry-date button (no available slots on previous date)
      if (v === 'slot_retry_date') {
        await askForDate(sender, ctx.service?.name || 'service');
        break;
      }
      if (v === 'slot_cancel') {
        await wa.sendText(sender, '❌ Booking cancelled. Type "menu" to start again.');
        await saveSession(sender, 'MAIN_MENU', {});
        break;
      }

      const { valid, date, error } = parseDate(v);
      if (!valid) {
        await wa.sendText(sender, error);
        break;
      }

      ctx.bookingDate = date;
      const hasSlots = await sendTimeSlots(sender, businessId, date, ctx.service?.duration_mins);
      if (hasSlots) {
        await saveSession(sender, 'BOOKING_TIME', ctx);
      } else {
        // Stay on BOOKING_DATE so they can pick another date
        await saveSession(sender, 'BOOKING_DATE', ctx);
      }
      break;
    }

    case 'BOOKING_TIME': {
      const v = input.value;

      if (v === 'slot_retry_date') {
        await askForDate(sender, ctx.service?.name || 'service');
        await saveSession(sender, 'BOOKING_DATE', ctx);
        break;
      }
      if (v === 'slot_cancel') {
        await wa.sendText(sender, '❌ Booking cancelled. Type "menu" to start again.');
        await saveSession(sender, 'MAIN_MENU', {});
        break;
      }

      if (!v.startsWith('slot_')) {
        await wa.sendText(sender, '⏰ Please tap a time slot from the list.');
        await sendTimeSlots(sender, businessId, ctx.bookingDate, ctx.service?.duration_mins);
        break;
      }

      ctx.bookingTime = v.replace('slot_', '');
      await sendBookingConfirmation(sender, ctx);
      await saveSession(sender, 'BOOKING_CONFIRM', ctx);
      break;
    }

    case 'BOOKING_CONFIRM': {
      const v = input.value;
      if (v === 'booking_confirm_yes' || v === 'yes' || v === 'confirm') {
        const { orderId } = await placeBooking(sender, senderName, ctx, businessId);
        _sseEmitter?.emit('new_order', { orderId, type: 'booking', sender });
        await saveSession(sender, 'MAIN_MENU', {});
      } else if (v === 'booking_confirm_no' || v === 'no' || v === 'cancel') {
        await wa.sendText(sender, '❌ Booking cancelled. Type "menu" to start again.');
        await saveSession(sender, 'MAIN_MENU', {});
      } else {
        await sendBookingConfirmation(sender, ctx);
      }
      break;
    }

    // ── Fallback ──────────────────────────────────────────────────
    default: {
      await sendWelcome(sender);
      await saveSession(sender, 'MAIN_MENU', {});
    }
  }
}

module.exports = { handleMessage, setSseEmitter };
