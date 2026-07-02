# WhatsApp Order & Booking Agent — Antigravity Build Guide

Target market: South African small businesses (salons, restaurants, spaza shops, service providers).

## Step 1: Install & open Antigravity
Download from antigravity.google/download, sign in with your Google account, and pick your model (Gemini 3 Pro is the default; Claude Sonnet is also supported).

## Step 2: Create the project
- Click **Select Project** → **New Project**
- Create/select a local folder, e.g. `whatsapp-order-agent`
- Antigravity treats a project as one or more folders that define what the agent can see and touch — keep this folder dedicated to this app only, so context stays clean.

## Step 3: Kick off with an Implementation Plan prompt
Use **Plan Mode** so the agent proposes a plan before touching files. Paste this as your first message:

```
Build a WhatsApp-based ordering and booking assistant for small South African businesses (salons, restaurants, spaza shops). Requirements:
- Node.js backend using the WhatsApp Business Cloud API (webhook-based)
- Customers message the business's WhatsApp number to see a menu/services list, place an order or book a slot, and get confirmation
- Simple owner dashboard (web page) to view/manage incoming orders and bookings, mark them done, and edit the menu/services list
- Store data in SQLite for now (easy to swap to Postgres later)
- Include a .env.example for WhatsApp API credentials
- Add a README explaining how to get WhatsApp Business API access and deploy
Give me an implementation plan before writing code.
```

## Step 4: Review the plan artifact
Antigravity generates an **Implementation Plan** artifact. Read it, adjust anything (e.g. "make the menu support multiple languages — isiZulu and English"), then click **Proceed**.

## Step 5: Let it build, then verify
It will create the task list, write code, and use the terminal to install dependencies and run the app. Approve permission prompts (installing packages, running the server) when asked. It produces a **Walkthrough** artifact showing what was built and how to test it.

## Step 6: Iterate with follow-up prompts
Once the base app runs, refine it with prompts like:

```
Add a broadcast feature so the owner can send a WhatsApp message to all customers who ordered this month.
```

```
Add payment confirmation via SnapScan or manual EFT reference number.
```

```
Make the dashboard mobile-friendly since most owners will check it on their phone.
```

## Step 7: Package it to sell
```
Generate a setup guide a non-technical small business owner could follow to get this running with their own WhatsApp Business number.
```

```
Add a simple admin login so I can white-label and resell this to multiple businesses.
```

## Notes
- Keep each business's data in its own SQLite file (or add a `business_id` column) so this can scale to multiple resold clients from one codebase.
- WhatsApp Business Cloud API requires a Meta Business account and a verified phone number — factor setup time into client onboarding.
