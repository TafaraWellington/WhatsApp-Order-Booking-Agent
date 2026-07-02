/**
 * Menu/service browse step handler.
 * Used by restaurant & spaza for MENU_VIEW.
 * Salon uses a simpler version inside booking.js.
 */

const wa = require('../whatsapp');
const db = require('../../db');

/**
 * Fetch all available menu items grouped by category.
 * @returns {object} { [category]: [item, ...] }
 */
async function getMenuGrouped(businessId) {
  const items = await db('menu_items')
    .where({ business_id: businessId, available: true })
    .orderBy(['category', 'sort_order', 'name']);

  return items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
}

/**
 * Format item price + duration for list row description.
 */
function itemDescription(item) {
  const parts = [`R${Number(item.price).toFixed(2)}`];
  if (item.duration_mins) parts.push(`~${item.duration_mins} min`);
  if (item.description) parts.push(item.description);
  return parts.join(' · ').slice(0, 72);
}

/**
 * Send the full menu as WhatsApp list message(s).
 * WhatsApp supports max 10 sections × 10 rows each.
 * Splits into multiple messages if needed.
 */
async function sendMenu(to, businessId) {
  const grouped = await getMenuGrouped(businessId);
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    await wa.sendText(to, '😔 No items available at the moment. Please check back soon!');
    return;
  }

  // Build sections (max 10 per message)
  const sections = categories.map((cat) => ({
    title: cat,
    rows: grouped[cat].map((item) => ({
      id: `item_${item.id}`,
      title: item.name,
      description: itemDescription(item),
    })),
  }));

  // Split into chunks of 10 sections per list message
  const chunks = [];
  for (let i = 0; i < sections.length; i += 10) {
    chunks.push(sections.slice(i, i + 10));
  }

  for (let i = 0; i < chunks.length; i++) {
    await wa.sendList(to, {
      header: i === 0 ? '🍽️ Our Menu' : '🍽️ Menu (continued)',
      body: 'Tap an item to view details or add to your order.',
      footer: 'Type "order" to start ordering',
      button: 'Browse Menu',
      sections: chunks[i],
    });
  }
}

/**
 * Send services list for salons.
 * Returns the items for reference.
 */
async function sendServicesList(to, businessId) {
  const grouped = await getMenuGrouped(businessId);
  const categories = Object.keys(grouped);

  if (categories.length === 0) {
    await wa.sendText(to, '😔 No services available at the moment. Please check back soon!');
    return [];
  }

  const sections = categories.map((cat) => ({
    title: cat,
    rows: grouped[cat].map((item) => ({
      id: `svc_${item.id}`,
      title: item.name,
      description: itemDescription(item),
    })),
  }));

  await wa.sendList(to, {
    header: '💅 Our Services',
    body: 'Select a service to book an appointment.',
    footer: 'Prices include all materials',
    button: 'View Services',
    sections,
  });

  // Return flat list for step context
  return Object.values(grouped).flat();
}

module.exports = { sendMenu, sendServicesList, getMenuGrouped, itemDescription };
