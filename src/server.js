/**
 * Server entry point.
 * Sets up the database schema, seeds demo data if empty, then starts Express.
 */

require('dotenv').config();
const { setup } = require('./db/setup');
const { seed } = require('./db/seeds/01_demo');
const createApp = require('./app');

const PORT = process.env.PORT || 3000;

async function main() {
  console.log('🔧 Setting up database schema…');
  await setup();
  console.log('✅ Schema ready');

  console.log('🌱 Seeding demo data (skipped if data exists)…');
  await seed();

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`\n🚀 WhatsApp Order Agent running on port ${PORT}`);
    console.log(`   Dashboard: http://localhost:${PORT}`);
    console.log(`   Webhook:   http://localhost:${PORT}/webhook`);
    console.log(`   Health:    http://localhost:${PORT}/health\n`);
  });
}

main().catch((err) => {
  console.error('❌ Startup failed:', err);
  process.exit(1);
});
