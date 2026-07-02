/**
 * Database schema setup (replaces Knex migrations).
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup.
 */

const db = require('../db');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS businesses (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    type              TEXT    NOT NULL CHECK(type IN ('salon','restaurant','spaza')),
    welcome_message   TEXT,
    slot_duration_mins INTEGER DEFAULT 30,
    created_at        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS business_hours (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    day_of_week  INTEGER NOT NULL,
    open_time    TEXT    NOT NULL DEFAULT '08:00',
    close_time   TEXT    NOT NULL DEFAULT '17:00',
    is_closed    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    category     TEXT    NOT NULL DEFAULT 'General',
    name         TEXT    NOT NULL,
    description  TEXT,
    price        REAL    NOT NULL DEFAULT 0,
    duration_mins INTEGER,
    available    INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_sender    TEXT    NOT NULL UNIQUE,
    step         TEXT    NOT NULL DEFAULT 'START',
    context_json TEXT    NOT NULL DEFAULT '{}',
    updated_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    wa_sender    TEXT    NOT NULL,
    wa_name      TEXT,
    type         TEXT    NOT NULL CHECK(type IN ('order','booking')),
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','confirmed','done','cancelled')),
    total_amount REAL    DEFAULT 0,
    notes        TEXT,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    name         TEXT    NOT NULL,
    qty          INTEGER NOT NULL DEFAULT 1,
    unit_price   REAL    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id),
    service_name TEXT,
    slot_date    TEXT    NOT NULL,
    slot_time    TEXT    NOT NULL,
    duration_mins INTEGER
  );
`;

async function setup() {
  db.exec(SCHEMA);
}

module.exports = { setup };
