# WhatsApp-Order-Booking-Agent
WhatsApp Order &amp; Booking Agent – for salons, restaurants, spaza shops, and service providers. WhatsApp dominates SA messaging, and most small businesses still take orders manually. Sells itself as "never miss a booking again."
A WhatsApp-based ordering and booking assistant for small South African businesses — salons, restaurants, and spaza shops.

Customers message your WhatsApp Business number to browse a menu, place an order, or book an appointment. You manage everything from a slick owner dashboard.

✨ Features
Feature	Details
🤖 WhatsApp bot	Interactive list & button messages — no typing required
🛒 Orders	Add items to cart, confirm, get a reference number
📅 Bookings	Pick service → date → auto-generated time slots → confirm
📋 Dashboard	Live order feed (SSE), one-click status updates
🍽️ Menu editor	Add, edit, toggle availability without touching code
⚙️ Business hours	Configure open/close times per day — slots auto-generated
📊 Stats	Today's revenue, order counts, hourly & weekly charts
🗄️ SQLite → Postgres	One config change to swap databases
🏗️ Tech Stack
Node.js + Express — backend
WhatsApp Business Cloud API — messaging
Knex.js + better-sqlite3 — database (Postgres-ready)
Vanilla HTML/CSS/JS — owner dashboard (no build step)
