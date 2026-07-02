/**
 * Order flow step handlers (restaurant / spaza).
 *
 * Steps:
 *   ORDER_START   → show full menu as selectable list
 *   ORDER_ITEM    → item selected, added to cart; ask add-more or checkout
 *   ORDER_CONFIRM → show cart summary; Yes = place / No = restart
 *   ORDER_PLACED  → write to DB, send confirmation, → MAIN_MENU
 */

const wa = require('../whatsapp');
const db = require('../../db');
const { getMenuGrouped, itemDescription } = require('./menu');
const { getBusiness } = require('./welcome');

// ── ORDER_START ──────────────────────────────────────────────────

/**
 * Show the full menu as a list so the customer can tap an item.
 */
async function startOrder(to, businessId) {
  const grouped = await getMenuGrouped(businessId);
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    await wa.sendText(to, '😔 Our menu is empty right now. Please check back soon!');
    return false;
  }

  const sections = categories.map((cat) => ({
    title: cat,
    rows: grouped[cat].map((item) => ({
      id: `order_item_${item.id}`,
      title: item.name,
      description: itemDescription(item),
    })),
  }));

  await wa.sendList(to, {
    header: '🛒 Place an Order',
    body: 'Select an item to add to your cart.',
    footer: 'Tap an item to add it',
    button: 'Browse Menu',
    sections,
  });

  return true;
}

// ── ORDER_ITEM (item tapped) ─────────────────────────────────────

/**
 * Process an item selection:
 *   - Parse item ID from interactive reply (id = "order_item_{n}")
 *   - Fetch item from DB
 *   - Add to cart in session context
 *   - Ask: add more or checkout?
 *
 * @param {string} to
 * @param {object} ctx         - current session context (mutated)
 * @param {string} selectedId  - e.g. "order_item_3"
 * @returns {object}           - { success, ctx }
 */
async function handleItemSelected(to, ctx, selectedId) {
  const itemId = parseInt(selectedId.replace('order_item_', ''), 10);
  if (isNaN(itemId)) {
    await wa.sendText(to, '⚠️ Please tap an item from the menu list to add it to your cart.');
    return { success: false, ctx };
  }

  const item = await db('menu_items').where({ id: itemId, available: true }).first();
  if (!item) {
    await wa.sendText(to, '⚠️ Sorry, that item is no longer available. Please choose another.');
    return { success: false, ctx };
  }

  // Initialise cart if needed
  if (!ctx.cart) ctx.cart = [];

  // Check if item already in cart → increment qty
  const existing = ctx.cart.find((c) => c.item_id === item.id);
  if (existing) {
    existing.qty += 1;
  } else {
    ctx.cart.push({
      item_id: item.id,
      name: item.name,
      qty: 1,
      unit_price: Number(item.price),
    });
  }

  const cartTotal = cartTotalAmount(ctx.cart);
  const cartSummary = formatCartLines(ctx.cart);

  await wa.sendButtons(to, {
    body: `✅ *${item.name}* added!\n\n🛒 *Your cart:*\n${cartSummary}\n\n*Total: R${cartTotal.toFixed(2)}*`,
    footer: 'What would you like to do?',
    buttons: [
      { id: 'cart_add_more', title: '➕ Add More' },
      { id: 'cart_checkout', title: '✅ Checkout' },
    ],
  });

  return { success: true, ctx };
}

// ── ORDER_CONFIRM ────────────────────────────────────────────────

async function sendOrderConfirmation(to, ctx) {
  const cartSummary = formatCartLines(ctx.cart);
  const total = cartTotalAmount(ctx.cart);

  await wa.sendButtons(to, {
    body: `📋 *Order Summary:*\n\n${cartSummary}\n\n💰 *Total: R${total.toFixed(2)}*\n\nConfirm your order?`,
    footer: 'This cannot be undone',
    buttons: [
      { id: 'order_confirm_yes', title: '✅ Confirm' },
      { id: 'order_confirm_no', title: '❌ Cancel' },
    ],
  });
}

// ── ORDER_PLACED ─────────────────────────────────────────────────

/**
 * Persist the order to the database and send a confirmation message.
 * @returns {object} { orderId }
 */
async function placeOrder(to, senderName, ctx, businessId) {
  const total = cartTotalAmount(ctx.cart);

  // Insert order header
  const [orderId] = await db('orders').insert({
    business_id: businessId,
    wa_sender: to,
    wa_name: senderName || to,
    type: 'order',
    status: 'pending',
    total_amount: total,
  });

  // Insert line items
  await db('order_items').insert(
    ctx.cart.map((item) => ({
      order_id: orderId,
      menu_item_id: item.item_id,
      name: item.name,
      qty: item.qty,
      unit_price: item.unit_price,
    }))
  );

  const business = await getBusiness();
  const ref = `ORD-${String(orderId).padStart(4, '0')}`;
  const cartSummary = formatCartLines(ctx.cart);

  const confirmText =
    `✅ *Order Confirmed!* ${ref}\n` +
    `${'─'.repeat(22)}\n` +
    cartSummary + '\n' +
    `${'─'.repeat(22)}\n` +
    `💰 *Total: R${total.toFixed(2)}*\n` +
    `${'─'.repeat(22)}\n` +
    `We'll have it ready soon! 🔥\n\n` +
    `Thank you for ordering from *${business?.name || 'us'}* 💚\n\n` +
    `_Type "menu" to start a new order_`;

  await wa.sendText(to, confirmText);

  return { orderId, ref };
}

// ── Helpers ──────────────────────────────────────────────────────

function cartTotalAmount(cart) {
  return cart.reduce((sum, c) => sum + c.qty * c.unit_price, 0);
}

function formatCartLines(cart) {
  return cart.map((c) => `${c.qty}× ${c.name}  —  R${(c.qty * c.unit_price).toFixed(2)}`).join('\n');
}

module.exports = {
  startOrder,
  handleItemSelected,
  sendOrderConfirmation,
  placeOrder,
  cartTotalAmount,
};
