/**
 * WhatsApp webhook routes.
 *
 * GET  /webhook  — Meta verification handshake
 * POST /webhook  — Inbound messages from Meta Cloud API
 *
 * Meta sends all events (messages, status updates, etc.) to the same
 * POST endpoint. We filter for message events and ignore the rest.
 */

const express = require('express');
const router = express.Router();
const { handleMessage } = require('../conversation/engine');
const { markRead } = require('../conversation/whatsapp');

// ── GET /webhook — verification handshake ────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }

  console.warn('⚠️  Webhook verification failed — check WHATSAPP_VERIFY_TOKEN');
  return res.sendStatus(403);
});

// ── POST /webhook — inbound messages ─────────────────────────────
router.post('/', async (req, res) => {
  // Always ACK immediately — Meta expects 200 within 5 s
  res.sendStatus(200);

  try {
    const body = req.body;

    // Guard: only handle WhatsApp Business Cloud events
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const messages = value?.messages;
        if (!messages || messages.length === 0) continue;

        for (const message of messages) {
          const sender = message.from; // E.164 number
          const senderName = value.contacts?.find((c) => c.wa_id === sender)?.profile?.name || sender;

          // Mark message as read (shows double blue tick on sender's phone)
          try {
            await markRead(message.id);
          } catch (_) {
            // Non-fatal
          }

          // Only handle supported message types
          const supported = ['text', 'interactive'];
          if (!supported.includes(message.type)) {
            // Politely ignore unsupported types (image, audio, sticker, etc.)
            continue;
          }

          console.log(`📨 [${new Date().toISOString()}] From ${senderName} (${sender}): ${message.type}`);

          // Hand off to conversation engine (non-blocking)
          handleMessage(sender, senderName, message).catch((err) => {
            console.error(`Engine error for ${sender}:`, err.message);
          });
        }
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

module.exports = router;
