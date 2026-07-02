/**
 * Express application factory.
 * Wires up middleware, routes, and the static dashboard.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const webhookRouter = require('./routes/webhook');
const { router: dashboardRouter, getSseEmitter } = require('./routes/dashboard');
const { setSseEmitter } = require('./conversation/engine');

function createApp() {
  const app = express();

  // ── Middleware ────────────────────────────────────────────────
  app.use(cors());
  // Raw body needed for webhook signature verification (future)
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ── Static dashboard ──────────────────────────────────────────
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ── Routes ────────────────────────────────────────────────────
  app.use('/webhook', webhookRouter);
  app.use('/api', dashboardRouter);

  // ── Health check ──────────────────────────────────────────────
  app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

  // ── Wire SSE emitter into engine ──────────────────────────────
  setSseEmitter(getSseEmitter());

  return app;
}

module.exports = createApp;
