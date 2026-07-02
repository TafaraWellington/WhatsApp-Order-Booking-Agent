/**
 * Booking flow step handlers (salon appointments).
 *
 * Steps:
 *   SERVICE_SELECT  → show services list, customer picks one
 *   BOOKING_DATE    → ask for date (DD/MM/YYYY), validate
 *   BOOKING_TIME    → auto-generate slots from business hours, show as list
 *   BOOKING_CONFIRM → summary + Yes/No
 *   BOOKING_PLACED  → persist to DB, send confirmation → MAIN_MENU
 */

const wa = require('../whatsapp');
const db = require('../../db');
const { sendServicesList } = require('./menu');
const { getBusiness } = require('./welcome');

// ── SERVICE_SELECT ────────────────────────────────────────────────

/**
 * Display services list for selection.
 * Returns the flat list of available services.
 */
async function sendServices(to, businessId) {
  return sendServicesList(to, businessId);
}

/**
 * Parse the selected service from an interactive reply id.
 * id format: "svc_{itemId}"
 */
async function resolveService(selectedId) {
  const itemId = parseInt(selectedId.replace('svc_', ''), 10);
  if (isNaN(itemId)) return null;
  return db('menu_items').where({ id: itemId, available: true }).first();
}

// ── BOOKING_DATE ──────────────────────────────────────────────────

async function askForDate(to, serviceName) {
  await wa.sendText(
    to,
    `📅 Great choice! *${serviceName}*\n\nPlease enter your preferred date:\n\n_Format: DD/MM/YYYY (e.g. 25/07/2025)_`
  );
}

/**
 * Parse DD/MM/YYYY → { valid, date: 'YYYY-MM-DD', error }
 */
function parseDate(raw) {
  const match = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return { valid: false, error: '⚠️ Invalid format. Please use DD/MM/YYYY (e.g. 25/07/2025).' };

  const [, dd, mm, yyyy] = match;
  const d = parseInt(dd, 10);
  const m = parseInt(mm, 10) - 1;
  const y = parseInt(yyyy, 10);
  const date = new Date(y, m, d);

  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) {
    return { valid: false, error: '⚠️ That date doesn\'t exist. Please try again.' };
  }

  // Must be in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) {
    return { valid: false, error: '⚠️ Please choose a future date.' };
  }

  // Not more than 3 months ahead
  const max = new Date();
  max.setMonth(max.getMonth() + 3);
  if (date > max) {
    return { valid: false, error: '⚠️ Please choose a date within the next 3 months.' };
  }

  const isoDate = `${yyyy}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { valid: true, date: isoDate };
}

// ── BOOKING_TIME ──────────────────────────────────────────────────

/**
 * Generate available time slots for a given date.
 *
 * Algorithm:
 *  1. Look up business_hours for that day-of-week.
 *  2. Split open→close into slot_duration_mins increments.
 *  3. Remove slots that overlap with existing confirmed bookings.
 *
 * @param {number} businessId
 * @param {string} isoDate     - YYYY-MM-DD
 * @param {number} serviceDuration - duration of the requested service in mins
 * @returns {string[]}         - array of 'HH:MM' strings
 */
async function getAvailableSlots(businessId, isoDate, serviceDuration) {
  const date = new Date(isoDate);
  const dayOfWeek = date.getDay(); // 0=Sun

  const hours = await db('business_hours')
    .where({ business_id: businessId, day_of_week: dayOfWeek })
    .first();

  if (!hours || hours.is_closed) return [];

  const business = await getBusiness();
  const slotSize = business?.slot_duration_mins || 30;

  // Parse HH:MM → total minutes from midnight
  const toMins = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const open = toMins(hours.open_time);
  const close = toMins(hours.close_time);
  const duration = serviceDuration || slotSize;

  // Gather existing bookings for this date
  const bookedSlots = await db('bookings')
    .join('orders', 'bookings.order_id', 'orders.id')
    .where({
      'bookings.slot_date': isoDate,
      'orders.business_id': businessId,
    })
    .whereNotIn('orders.status', ['cancelled'])
    .select('bookings.slot_time', 'bookings.duration_mins');

  const slots = [];
  let current = open;

  while (current + duration <= close) {
    const slotHHMM = toHHMM(current);

    // Check if this slot overlaps with any existing booking
    const overlaps = bookedSlots.some((b) => {
      const bookedStart = toMins(b.slot_time);
      const bookedEnd = bookedStart + (b.duration_mins || slotSize);
      const slotEnd = current + duration;
      return current < bookedEnd && slotEnd > bookedStart;
    });

    if (!overlaps) {
      slots.push(slotHHMM);
    }
    current += slotSize; // advance by slot size (not duration) so slots don't double-up
  }

  return slots;
}

/**
 * Format HH:MM to 12-hour time with AM/PM.
 */
function to12Hour(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * Send available time slots as an interactive list.
 * Returns false if no slots are available.
 */
async function sendTimeSlots(to, businessId, isoDate, serviceDuration) {
  const slots = await getAvailableSlots(businessId, isoDate, serviceDuration);

  if (slots.length === 0) {
    await wa.sendButtons(to, {
      body: `😔 Sorry, we have no available slots on *${formatDisplayDate(isoDate)}*.\n\nWould you like to try another date?`,
      buttons: [
        { id: 'slot_retry_date', title: '📅 Try Another Date' },
        { id: 'slot_cancel', title: '❌ Cancel' },
      ],
    });
    return false;
  }

  // Split into sections if > 10 slots (rare but handled)
  const rows = slots.map((slot) => ({
    id: `slot_${slot}`,
    title: to12Hour(slot),
    description: '',
  }));

  const sections = [];
  for (let i = 0; i < rows.length; i += 10) {
    sections.push({ title: i === 0 ? 'Morning / Afternoon' : 'Later slots', rows: rows.slice(i, i + 10) });
  }

  await wa.sendList(to, {
    header: `⏰ Available Times`,
    body: `*${formatDisplayDate(isoDate)}*\n\nSelect your preferred time slot:`,
    footer: 'All times are South African Standard Time',
    button: 'Pick a Time',
    sections,
  });

  return true;
}

// ── BOOKING_CONFIRM ───────────────────────────────────────────────

async function sendBookingConfirmation(to, ctx) {
  const { service, bookingDate, bookingTime } = ctx;

  const confirmText =
    `📋 *Booking Summary:*\n\n` +
    `💅 Service:   ${service.name}\n` +
    `📅 Date:      ${formatDisplayDate(bookingDate)}\n` +
    `⏰ Time:      ${to12Hour(bookingTime)}\n` +
    `⏱️ Duration: ~${service.duration_mins} min\n` +
    `💰 Price:     R${Number(service.price).toFixed(2)}\n\n` +
    `Confirm this booking?`;

  await wa.sendButtons(to, {
    body: confirmText,
    footer: 'We\'ll send a reminder 24h before',
    buttons: [
      { id: 'booking_confirm_yes', title: '✅ Confirm' },
      { id: 'booking_confirm_no', title: '❌ Cancel' },
    ],
  });
}

// ── BOOKING_PLACED ────────────────────────────────────────────────

async function placeBooking(to, senderName, ctx, businessId) {
  const { service, bookingDate, bookingTime } = ctx;

  // Insert order header
  const [orderId] = await db('orders').insert({
    business_id: businessId,
    wa_sender: to,
    wa_name: senderName || to,
    type: 'booking',
    status: 'pending',
    total_amount: Number(service.price),
  });

  // Insert booking detail
  await db('bookings').insert({
    order_id: orderId,
    menu_item_id: service.id,
    service_name: service.name,
    slot_date: bookingDate,
    slot_time: bookingTime,
    duration_mins: service.duration_mins,
  });

  const business = await getBusiness();
  const ref = `BKG-${String(orderId).padStart(4, '0')}`;

  const confirmText =
    `✅ *Booking Confirmed!* ${ref}\n` +
    `${'─'.repeat(24)}\n` +
    `💅 Service:   ${service.name}\n` +
    `📅 Date:      ${formatDisplayDate(bookingDate)}\n` +
    `⏰ Time:      ${to12Hour(bookingTime)}\n` +
    `⏱️ Duration: ~${service.duration_mins} min\n` +
    `💰 Price:     R${Number(service.price).toFixed(2)}\n` +
    `${'─'.repeat(24)}\n` +
    `See you then! 💅\n\n` +
    `*${business?.name || 'Us'}*\n\n` +
    `_Type "menu" to start a new booking_`;

  await wa.sendText(to, confirmText);

  return { orderId, ref };
}

// ── Helpers ───────────────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDisplayDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00'); // avoid TZ offset
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

module.exports = {
  sendServices,
  resolveService,
  askForDate,
  parseDate,
  sendTimeSlots,
  sendBookingConfirmation,
  placeBooking,
  to12Hour,
  formatDisplayDate,
};
