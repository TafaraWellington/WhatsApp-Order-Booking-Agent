/**
 * Demo seed — inserts a business matching BUSINESS_TYPE in .env,
 * with sample menu/services and default business hours.
 *
 * Safe to re-run: checks if business row already exists first.
 */

const BUSINESS_TYPE = process.env.BUSINESS_TYPE || 'salon';
const db = require('../index');

// ── Salon demo data ──────────────────────────────────────────────
const SALON_DATA = {
  name: process.env.BUSINESS_NAME || 'Glamour Salon',
  type: 'salon',
  welcome_message:
    '💅 Welcome to *Glamour Salon*!\n\nWe offer professional hair, nails & beauty services.\n\nWhat would you like to do?',
  slot_duration_mins: 30,
  services: [
    { category: 'Hair', name: 'Wash & Blow Dry', price: 180, duration_mins: 60, description: 'Shampoo, condition & style' },
    { category: 'Hair', name: 'Hair Relaxer', price: 350, duration_mins: 90, description: 'Includes treatment & blow dry' },
    { category: 'Hair', name: 'Box Braids', price: 650, duration_mins: 240, description: 'Full head, medium size' },
    { category: 'Hair', name: 'Trim & Style', price: 120, duration_mins: 45, description: 'Ends trim and finish' },
    { category: 'Nails', name: 'Manicure', price: 150, duration_mins: 45, description: 'Shape, buff & colour' },
    { category: 'Nails', name: 'Pedicure', price: 180, duration_mins: 60, description: 'Soak, scrub, shape & colour' },
    { category: 'Nails', name: 'Gel Nails', price: 280, duration_mins: 75, description: 'Full set, choose colour' },
    { category: 'Beauty', name: 'Eyebrow Shape', price: 80, duration_mins: 20, description: 'Threading or wax' },
    { category: 'Beauty', name: 'Facial', price: 320, duration_mins: 60, description: 'Deep cleanse & moisturise' },
  ],
};

// ── Restaurant demo data ─────────────────────────────────────────
const RESTAURANT_DATA = {
  name: process.env.BUSINESS_NAME || "Mama's Kitchen",
  type: 'restaurant',
  welcome_message:
    "🍽️ Welcome to *Mama's Kitchen*!\n\nHome-cooked meals made with love 💚\n\nWhat would you like to do?",
  slot_duration_mins: 30,
  items: [
    { category: 'Mains', name: 'Pap & Vleis', price: 85, description: 'Maize meal with beef stew' },
    { category: 'Mains', name: 'Grilled Chicken', price: 95, description: 'Half chicken, chips & salad' },
    { category: 'Mains', name: 'Bunny Chow', price: 65, description: 'Quarter loaf, lamb curry' },
    { category: 'Mains', name: 'Gatsby', price: 75, description: 'Loaded French loaf roll' },
    { category: 'Sides', name: 'Chips', price: 25, description: 'Golden & crispy' },
    { category: 'Sides', name: 'Coleslaw', price: 20, description: 'Creamy house dressing' },
    { category: 'Sides', name: 'Pap', price: 20, description: 'Soft white maize meal' },
    { category: 'Drinks', name: 'Coke 500ml', price: 22, description: '' },
    { category: 'Drinks', name: 'Juice 300ml', price: 18, description: 'Apple or orange' },
    { category: 'Drinks', name: 'Water 500ml', price: 12, description: '' },
    { category: 'Desserts', name: 'Malva Pudding', price: 45, description: 'With custard or ice cream' },
    { category: 'Desserts', name: 'Koeksisters', price: 30, description: 'Sweet syrup pastry (2 pcs)' },
  ],
};

// ── Spaza demo data ──────────────────────────────────────────────
const SPAZA_DATA = {
  name: process.env.BUSINESS_NAME || 'Corner Spaza Shop',
  type: 'spaza',
  welcome_message:
    '🛒 Welcome to *Corner Spaza Shop*!\n\nOrder essentials delivered to your door. 📦\n\nWhat would you like to do?',
  slot_duration_mins: 30,
  items: [
    { category: 'Grocery', name: 'Bread (700g)', price: 20, description: 'White or brown' },
    { category: 'Grocery', name: 'Milk (1L)', price: 22, description: 'Full cream' },
    { category: 'Grocery', name: 'Eggs (6 pack)', price: 28, description: 'Free range' },
    { category: 'Grocery', name: 'Maize Meal (2.5kg)', price: 38, description: 'Super Maize' },
    { category: 'Grocery', name: 'Rice (2kg)', price: 42, description: 'Long grain white' },
    { category: 'Airtime', name: 'Vodacom R10', price: 10, description: 'Instant recharge' },
    { category: 'Airtime', name: 'MTN R20', price: 20, description: 'Instant recharge' },
    { category: 'Airtime', name: 'Telkom R29', price: 29, description: 'Instant recharge' },
    { category: 'Snacks', name: 'Simba Chips', price: 8, description: '50g bag' },
    { category: 'Snacks', name: 'Chappies x5', price: 5, description: 'Mixed flavours' },
    { category: 'Drinks', name: 'Coke 330ml', price: 16, description: '' },
    { category: 'Drinks', name: 'Energade 500ml', price: 18, description: 'Lemon flavour' },
  ],
};

const DEMO_MAP = {
  salon: SALON_DATA,
  restaurant: RESTAURANT_DATA,
  spaza: SPAZA_DATA,
};

// Default business hours: Mon–Fri 08:00–17:00, Sat 09:00–14:00, Sun closed
function defaultHours(businessId) {
  return [
    { business_id: businessId, day_of_week: 0, open_time: '09:00', close_time: '13:00', is_closed: true },   // Sun
    { business_id: businessId, day_of_week: 1, open_time: '08:00', close_time: '17:00', is_closed: false },  // Mon
    { business_id: businessId, day_of_week: 2, open_time: '08:00', close_time: '17:00', is_closed: false },  // Tue
    { business_id: businessId, day_of_week: 3, open_time: '08:00', close_time: '17:00', is_closed: false },  // Wed
    { business_id: businessId, day_of_week: 4, open_time: '08:00', close_time: '17:00', is_closed: false },  // Thu
    { business_id: businessId, day_of_week: 5, open_time: '08:00', close_time: '17:00', is_closed: false },  // Fri
    { business_id: businessId, day_of_week: 6, open_time: '09:00', close_time: '14:00', is_closed: false },  // Sat
  ];
}

exports.seed = async () => {
  // Skip if already seeded
  const existing = await db('businesses').first();
  if (existing) return;

  const data = DEMO_MAP[BUSINESS_TYPE] || SALON_DATA;

  // Insert business
  const [businessId] = await db('businesses').insert({
    name: data.name,
    type: data.type,
    welcome_message: data.welcome_message,
    slot_duration_mins: data.slot_duration_mins,
  });

  // Insert business hours
  await db('business_hours').insert(defaultHours(businessId));

  // Insert menu/services
  const items = data.services || data.items || [];
  await db('menu_items').insert(
    items.map((item, idx) => ({
      business_id: businessId,
      category: item.category,
      name: item.name,
      description: item.description || '',
      price: item.price,
      duration_mins: item.duration_mins || null,
      available: true,
      sort_order: idx,
    }))
  );

  console.log(`✅ Seeded demo ${data.type} business: "${data.name}"`);
};
