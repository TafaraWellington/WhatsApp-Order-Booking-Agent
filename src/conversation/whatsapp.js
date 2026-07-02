/**
 * WhatsApp Cloud API wrapper.
 *
 * Exposes helpers for sending:
 *   - Plain text messages
 *   - Interactive list messages (menu / service selection)
 *   - Interactive reply-button messages (Yes/No confirmations)
 *
 * All functions accept an E.164 phone number as `to`.
 */

const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Core send helper.
 * @param {object} payload - WhatsApp message payload
 */
async function send(payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  try {
    const res = await axios.post(
      `${BASE_URL}/${phoneNumberId}/messages`,
      { messaging_product: 'whatsapp', ...payload },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return res.data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('WhatsApp API error:', JSON.stringify(detail, null, 2));
    throw err;
  }
}

/**
 * Send a plain text message.
 * @param {string} to   - Recipient phone (E.164)
 * @param {string} text - Message body (supports *bold*, _italic_)
 */
async function sendText(to, text) {
  return send({
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

/**
 * Send a WhatsApp interactive LIST message.
 * Good for displaying menus / service catalogues.
 *
 * @param {string} to
 * @param {object} opts
 * @param {string} opts.header   - Header text (shown in bold at top)
 * @param {string} opts.body     - Body text
 * @param {string} opts.footer   - Footer text (greyed out)
 * @param {string} opts.button   - Label on the button that opens the list (max 20 chars)
 * @param {Array}  opts.sections - Array of { title, rows: [{ id, title, description }] }
 *                                 title max 24 chars, description max 72 chars
 */
async function sendList(to, { header, body, footer, button, sections }) {
  return send({
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: truncate(header, 60) },
      body: { text: truncate(body, 1024) },
      footer: { text: truncate(footer || '', 60) },
      action: {
        button: truncate(button || 'View Options', 20),
        sections: sections.map((s) => ({
          title: truncate(s.title, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: String(r.id),
            title: truncate(r.title, 24),
            description: truncate(r.description || '', 72),
          })),
        })),
      },
    },
  });
}

/**
 * Send a WhatsApp interactive BUTTON message.
 * Good for 2–3 option confirmations.
 *
 * @param {string} to
 * @param {object} opts
 * @param {string} opts.body    - Body text
 * @param {string} opts.footer  - Optional footer
 * @param {Array}  opts.buttons - Array of { id, title } (max 3, title max 20 chars)
 */
async function sendButtons(to, { body, footer, buttons }) {
  return send({
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: truncate(body, 1024) },
      ...(footer ? { footer: { text: truncate(footer, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: truncate(b.title, 20) },
        })),
      },
    },
  });
}

/** Mark a message as read (removes the clock icon on sender's side) */
async function markRead(messageId) {
  return send({ status: 'read', message_id: messageId });
}

/** Truncate a string to max length safely */
function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

module.exports = { sendText, sendList, sendButtons, markRead };
