/**
 * Initial migration — creates all tables.
 *
 * Tables:
 *   businesses      — one row per deployment
 *   business_hours  — open/close times per day-of-week
 *   menu_items      — products or services offered
 *   sessions        — per-customer conversation state
 *   orders          — order or booking header
 *   order_items     — line items for orders
 *   bookings        — slot details for booking-type orders
 */

exports.up = async (knex) => {
  // ── businesses ──────────────────────────────────────────────────
  await knex.schema.createTable('businesses', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.enu('type', ['salon', 'restaurant', 'spaza']).notNullable();
    t.text('welcome_message');
    t.integer('slot_duration_mins').defaultTo(30); // salon booking slot size
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── business_hours ───────────────────────────────────────────────
  // day_of_week: 0 = Sunday … 6 = Saturday
  await knex.schema.createTable('business_hours', (t) => {
    t.increments('id').primary();
    t.integer('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
    t.integer('day_of_week').notNullable(); // 0–6
    t.string('open_time', 5).notNullable().defaultTo('08:00');  // HH:MM
    t.string('close_time', 5).notNullable().defaultTo('17:00'); // HH:MM
    t.boolean('is_closed').notNullable().defaultTo(false);
  });

  // ── menu_items ───────────────────────────────────────────────────
  await knex.schema.createTable('menu_items', (t) => {
    t.increments('id').primary();
    t.integer('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
    t.string('category').notNullable().defaultTo('General');
    t.string('name').notNullable();
    t.text('description');
    t.decimal('price', 10, 2).notNullable().defaultTo(0);
    t.integer('duration_mins'); // salon services only
    t.boolean('available').notNullable().defaultTo(true);
    t.integer('sort_order').defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── sessions ─────────────────────────────────────────────────────
  await knex.schema.createTable('sessions', (t) => {
    t.increments('id').primary();
    t.string('wa_sender').notNullable().unique(); // E.164 phone number
    t.string('step').notNullable().defaultTo('START');
    t.text('context_json').notNullable().defaultTo('{}');
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // ── orders ───────────────────────────────────────────────────────
  await knex.schema.createTable('orders', (t) => {
    t.increments('id').primary();
    t.integer('business_id').notNullable().references('id').inTable('businesses').onDelete('CASCADE');
    t.string('wa_sender').notNullable();
    t.string('wa_name');
    t.enu('type', ['order', 'booking']).notNullable();
    t.enu('status', ['pending', 'confirmed', 'done', 'cancelled']).notNullable().defaultTo('pending');
    t.decimal('total_amount', 10, 2).defaultTo(0);
    t.text('notes');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── order_items ──────────────────────────────────────────────────
  await knex.schema.createTable('order_items', (t) => {
    t.increments('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('menu_item_id').notNullable().references('id').inTable('menu_items');
    t.string('name').notNullable();         // snapshot at time of order
    t.integer('qty').notNullable().defaultTo(1);
    t.decimal('unit_price', 10, 2).notNullable();
  });

  // ── bookings ─────────────────────────────────────────────────────
  await knex.schema.createTable('bookings', (t) => {
    t.increments('id').primary();
    t.integer('order_id').notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('menu_item_id').references('id').inTable('menu_items'); // service booked
    t.string('service_name');   // snapshot
    t.string('slot_date').notNullable(); // YYYY-MM-DD
    t.string('slot_time').notNullable(); // HH:MM
    t.integer('duration_mins');
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('bookings');
  await knex.schema.dropTableIfExists('order_items');
  await knex.schema.dropTableIfExists('orders');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('menu_items');
  await knex.schema.dropTableIfExists('business_hours');
  await knex.schema.dropTableIfExists('businesses');
};
