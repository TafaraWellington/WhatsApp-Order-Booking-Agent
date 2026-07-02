/**
 * Owner Dashboard REST API.
 *
 * All routes prefixed with /api (set in app.js).
 *
 * Orders / Bookings
 *   GET    /api/orders             list (filter: status, type, date)
 *   GET    /api/orders/:id         single order with items/booking
 *   PATCH  /api/orders/:id/status  update status
 *
 * Menu
 *   GET    /api/menu               all items
 *   POST   /api/menu               create item
 *   PATCH  /api/menu/:id           update item
 *   DELETE /api/menu/:id           delete item
 *
 * Business Settings
 *   GET    /api/settings           business info + hours
 *   PATCH  /api/settings           update name, welcome message, slot duration
 *   PATCH  /api/hours              update business hours
 *
 * Stats
 *   GET    /api/stats              today's summary
 *
 * Real-time
 *   GET    /api/sse                Server-Sent Events stream
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const EventEmitter = require('events');

// Module-level SSE client registry
const sseClients = [];
const sseEmitter = new EventEmitter();

sseEmitter.on('new_order', (data) => {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try { res.write(payload); } catch (_) {}
  });
});

/** Expose emitter so engine.js can call setSseEmitter */
function getSseEmitter() { return sseEmitter; }

// ── Helper: get the one business row ────────────────────────────
async function getBiz() {
  return db('businesses').first();
}

// ── SSE endpoint ─────────────────────────────────────────────────
router.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send a heartbeat every 30 s to keep the connection alive
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 30000);

  sseClients.push(res);
  console.log(`📡 SSE client connected (total: ${sseClients.length})`);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`📡 SSE client disconnected (total: ${sseClients.length})`);
  });
});

// ── Orders ───────────────────────────────────────────────────────

router.get('/orders', async (req, res) => {
  try {
    const biz = await getBiz();
    let q = db('orders').where({ business_id: biz.id }).orderBy('created_at', 'desc');

    if (req.query.status) q = q.where({ status: req.query.status });
    if (req.query.type) q = q.where({ type: req.query.type });
    if (req.query.date) {
      // Filter by calendar date (created_at starts with YYYY-MM-DD)
      q = q.whereRaw("date(created_at) = ?", [req.query.date]);
    }

    const orders = await q.limit(200);
    res.json({ orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await db('orders').where({ id: req.params.id }).first();
    if (!order) return res.status(404).json({ error: 'Not found' });

    const items = await db('order_items').where({ order_id: order.id });
    const booking = await db('bookings').where({ order_id: order.id }).first();

    res.json({ ...order, items, booking: booking || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  const { status } = req.body;
  const valid = ['pending', 'confirmed', 'done', 'cancelled'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
  }
  try {
    await db('orders').where({ id: req.params.id }).update({ status });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Menu / Services ──────────────────────────────────────────────

router.get('/menu', async (req, res) => {
  try {
    const biz = await getBiz();
    const items = await db('menu_items')
      .where({ business_id: biz.id })
      .orderBy(['category', 'sort_order', 'name']);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/menu', async (req, res) => {
  try {
    const biz = await getBiz();
    const { category, name, description, price, duration_mins, available } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'name and price are required' });
    }
    const [id] = await db('menu_items').insert({
      business_id: biz.id,
      category: category || 'General',
      name,
      description: description || '',
      price: Number(price),
      duration_mins: duration_mins ? Number(duration_mins) : null,
      available: available !== false,
    });
    const item = await db('menu_items').where({ id }).first();
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/menu/:id', async (req, res) => {
  try {
    const { category, name, description, price, duration_mins, available, sort_order } = req.body;
    const updates = {};
    if (category !== undefined) updates.category = category;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = Number(price);
    if (duration_mins !== undefined) updates.duration_mins = duration_mins ? Number(duration_mins) : null;
    if (available !== undefined) updates.available = available;
    if (sort_order !== undefined) updates.sort_order = Number(sort_order);

    await db('menu_items').where({ id: req.params.id }).update(updates);
    const item = await db('menu_items').where({ id: req.params.id }).first();
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/menu/:id', async (req, res) => {
  try {
    await db('menu_items').where({ id: req.params.id }).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Business Settings ────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const biz = await getBiz();
    const hours = await db('business_hours').where({ business_id: biz.id }).orderBy('day_of_week');
    res.json({ business: biz, hours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings', async (req, res) => {
  try {
    const biz = await getBiz();
    const { name, welcome_message, slot_duration_mins } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (welcome_message !== undefined) updates.welcome_message = welcome_message;
    if (slot_duration_mins) updates.slot_duration_mins = Number(slot_duration_mins);
    await db('businesses').where({ id: biz.id }).update(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/hours', async (req, res) => {
  try {
    const biz = await getBiz();
    // Expect body: { hours: [{ day_of_week, open_time, close_time, is_closed }, ...] }
    const { hours } = req.body;
    if (!Array.isArray(hours)) return res.status(400).json({ error: 'hours must be an array' });

    for (const h of hours) {
      await db('business_hours')
        .where({ business_id: biz.id, day_of_week: h.day_of_week })
        .update({
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: h.is_closed ? 1 : 0,
        });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const biz = await getBiz();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const [todayOrders] = await db('orders')
      .where({ business_id: biz.id, type: 'order' })
      .whereRaw("date(created_at) = ?", [today])
      .whereNotIn('status', ['cancelled'])
      .count('id as count')
      .sum('total_amount as revenue');

    const [todayBookings] = await db('orders')
      .where({ business_id: biz.id, type: 'booking' })
      .whereRaw("date(created_at) = ?", [today])
      .whereNotIn('status', ['cancelled'])
      .count('id as count');

    const [pending] = await db('orders')
      .where({ business_id: biz.id, status: 'pending' })
      .count('id as count');

    // Hourly breakdown for today's orders (for bar chart)
    const hourly = await db('orders')
      .where({ business_id: biz.id })
      .whereRaw("date(created_at) = ?", [today])
      .whereNotIn('status', ['cancelled'])
      .select(db.raw("strftime('%H', created_at) as hour"))
      .count('id as count')
      .groupByRaw("strftime('%H', created_at)");

    // Last 7 days revenue
    const weekly = await db('orders')
      .where({ business_id: biz.id })
      .whereRaw("date(created_at) >= date('now', '-6 days')")
      .whereNotIn('status', ['cancelled'])
      .select(db.raw("date(created_at) as day"))
      .sum('total_amount as revenue')
      .count('id as count')
      .groupByRaw("date(created_at)")
      .orderBy('day');

    res.json({
      today: {
        orders: Number(todayOrders.count),
        bookings: Number(todayBookings.count),
        revenue: Number(todayOrders.revenue || 0),
        pending: Number(pending.count),
      },
      hourly,
      weekly,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, getSseEmitter };
