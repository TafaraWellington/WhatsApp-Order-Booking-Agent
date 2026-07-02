# 💬 WhatsApp Order Agent

A WhatsApp-based ordering and booking assistant for small South African businesses — salons, restaurants, and spaza shops.

Customers message your WhatsApp Business number to browse a menu, place an order, or book an appointment. You manage everything from a slick owner dashboard.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🤖 WhatsApp bot | Interactive list & button messages — no typing required |
| 🛒 Orders | Add items to cart, confirm, get a reference number |
| 📅 Bookings | Pick service → date → auto-generated time slots → confirm |
| 📋 Dashboard | Live order feed (SSE), one-click status updates |
| 🍽️ Menu editor | Add, edit, toggle availability without touching code |
| ⚙️ Business hours | Configure open/close times per day — slots auto-generated |
| 📊 Stats | Today's revenue, order counts, hourly & weekly charts |
| 🗄️ SQLite → Postgres | One config change to swap databases |

---

## 🏗️ Tech Stack

- **Node.js** + **Express** — backend
- **WhatsApp Business Cloud API** — messaging
- **Knex.js** + **better-sqlite3** — database (Postgres-ready)
- **Vanilla HTML/CSS/JS** — owner dashboard (no build step)

---

## 📋 Prerequisites

- Node.js 18+ ([download](https://nodejs.org))
- A Meta Developer account (free)
- A WhatsApp Business phone number (can use test number for development)
- For local development: [ngrok](https://ngrok.com) to expose your server

---

## 🔑 Getting WhatsApp Business API Access

### Step 1 — Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in.
2. Click **My Apps → Create App**.
3. Select **Business** as the app type.
4. Give your app a name and click **Create App**.

### Step 2 — Add WhatsApp to Your App

1. In the app dashboard, click **Add Products** and find **WhatsApp**.
2. Click **Set Up** next to WhatsApp.
3. You'll see **WhatsApp → API Setup** in the left sidebar.

### Step 3 — Get Your Credentials

From **WhatsApp → API Setup**:

| Credential | Where to find it |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | "From" phone number section — copy the numeric ID |
| `WHATSAPP_ACCESS_TOKEN` | "Temporary access token" (valid 24h in dev) or generate a **System User Token** for production |

> **Production tokens**: Go to **Business Settings → System Users**, create a system user, assign it to your app, and generate a permanent token with `whatsapp_business_messaging` permission.

### Step 4 — Register a Webhook

1. In **WhatsApp → Configuration**, click **Edit** next to Webhook.
2. Set the **Callback URL** to `https://your-domain.com/webhook`.
3. Set the **Verify Token** to the same value as `WHATSAPP_VERIFY_TOKEN` in your `.env`.
4. Subscribe to the **messages** field.

> For local dev, use `ngrok http 3000` to get a public URL.

### Step 5 — Add a Test Phone Number

In **WhatsApp → API Setup**, you get a free test number. Add your own number as a recipient to test (Meta limits test numbers to 5 recipients on the free tier).

---

## 🚀 Local Setup

```bash
# 1. Clone / enter project
cd whatsapp-order-agent

# 2. Install dependencies
npm install

# 3. Copy environment file
cp .env.example .env

# 4. Fill in your credentials in .env
#    (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN, BUSINESS_TYPE)

# 5. Start the server (runs migrations + seeds automatically)
npm run dev
```

The dashboard is at **http://localhost:3000**.

### ngrok Tunnel (for webhook testing)

```bash
ngrok http 3000
# Copy the https:// URL → use as your webhook callback URL in Meta console
```

---

## ⚙️ Environment Variables

| Variable | Required | Description |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ | Numeric ID from Meta API Setup |
| `WHATSAPP_ACCESS_TOKEN` | ✅ | Bearer token for sending messages |
| `WHATSAPP_VERIFY_TOKEN` | ✅ | Secret string you choose for webhook verification |
| `BUSINESS_TYPE` | ✅ | `salon` \| `restaurant` \| `spaza` |
| `BUSINESS_NAME` | — | Display name (also editable in dashboard) |
| `PORT` | — | HTTP port (default: 3000) |
| `DATABASE_URL` | — | Postgres connection string (omit for SQLite) |
| `DASHBOARD_USERNAME` | — | Basic auth username for dashboard |
| `DASHBOARD_PASSWORD` | — | Basic auth password for dashboard |

---

## 🗄️ Database

### Switching to Postgres

1. Set `DATABASE_URL=postgresql://user:pass@host:5432/dbname` in `.env`.
2. That's it — Knex handles the rest.

### Manual migration/seed commands

```bash
npm run migrate    # run pending migrations
npm run seed       # seed demo data (skipped if data exists)
npm run setup      # migrate + seed in one command
```

---

## 📱 Conversation Flows

### Salon
```
Customer says "Hi"
  → Welcome + main menu buttons
  → View Services (interactive list)
  → Tap service
  → Enter date (DD/MM/YYYY)
  → Pick available time slot (auto-generated from business hours)
  → Confirm booking → ✅ BKG-XXXX sent
```

### Restaurant / Spaza
```
Customer says "Hi"
  → Welcome + main menu buttons
  → Place Order → browse menu (interactive list)
  → Tap item → added to cart
  → Add More or Checkout
  → Confirm order → ✅ ORD-XXXX sent
```

---

## 🚢 Deployment

### Railway (recommended — free tier available)

```bash
# Install Railway CLI
npm i -g @railway/cli
railway login
railway init
railway up
```

Set environment variables in the Railway dashboard. Railway auto-detects Node.js.

### Render

1. Push to GitHub.
2. Create a new **Web Service** on [render.com](https://render.com).
3. Set **Build Command**: `npm install && npm run migrate`.
4. Set **Start Command**: `npm start`.
5. Add environment variables in the Render dashboard.

### DigitalOcean App Platform

1. Connect your GitHub repo.
2. Set the **Run Command**: `npm start`.
3. Add environment variables.
4. Deploy.

> **Note**: Attach a managed Postgres database and set `DATABASE_URL` for production. SQLite won't persist across deploys on ephemeral file systems (Render free tier, Railway without a volume).

---

## 📁 Project Structure

```
whatsapp-order-agent/
├── public/                 # Static dashboard (no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── app.js              # Express app factory
│   ├── server.js           # Entry point (migrate → seed → listen)
│   ├── db/
│   │   ├── index.js        # Knex singleton
│   │   ├── migrations/     # DB schema
│   │   └── seeds/          # Demo data
│   ├── conversation/
│   │   ├── engine.js       # State machine dispatcher
│   │   ├── whatsapp.js     # Meta Cloud API wrapper
│   │   └── steps/          # One file per flow (welcome, menu, order, booking)
│   └── routes/
│       ├── webhook.js      # WhatsApp webhook (GET verify + POST receive)
│       └── dashboard.js    # REST API + SSE for dashboard
├── data/                   # SQLite file (gitignored)
├── .env.example
├── knexfile.js
└── package.json
```

---

## 🤝 Contributing

Pull requests welcome! Key areas for improvement:
- 🌍 Multi-language support (Zulu, Xhosa, Afrikaans)
- 💳 SnapScan / PayFast payment links in confirmations
- 📲 SMS fallback via Africa's Talking
- 🔔 Push notifications to owner (Telegram / email)
