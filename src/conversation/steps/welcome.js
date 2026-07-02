/**
 * Welcome / Main Menu step handlers.
 *
 * Handles:
 *   START       → send welcome + main menu buttons
 *   MAIN_MENU   → (re-sent on 'menu', 'hi', 'hello', etc.)
 *
 * Returns messages to send and the next session step.
 */

const wa = require('../whatsapp');
const db = require('../../db');

const BUSINESS_TYPE = process.env.BUSINESS_TYPE || 'salon';

/**
 * Get or create the business row from DB.
 * Cached after first call.
 */
let _business = null;
async function getBusiness() {
  if (!_business) {
    _business = await db('businesses').first();
  }
  return _business;
}

/**
 * Build main-menu buttons based on business type.
 */
function mainMenuButtons() {
  if (BUSINESS_TYPE === 'salon') {
    return [
      { id: 'action_services', title: '💇 View Services' },
      { id: 'action_book', title: '📅 Book Appointment' },
      { id: 'action_help', title: '❓ Help' },
    ];
  }
  // restaurant / spaza
  return [
    { id: 'action_menu', title: '🍽️ View Menu' },
    { id: 'action_order', title: '🛒 Place Order' },
    { id: 'action_help', title: '❓ Help' },
  ];
}

/**
 * Send welcome message + main menu buttons.
 */
async function sendWelcome(to) {
  const business = await getBusiness();
  const welcomeText =
    business?.welcome_message ||
    `👋 Welcome to *${process.env.BUSINESS_NAME || 'our business'}*!\n\nWhat would you like to do?`;

  await wa.sendText(to, welcomeText);
  await wa.sendButtons(to, {
    body: '👇 Choose an option below:',
    buttons: mainMenuButtons(),
  });
}

/**
 * Handle a main-menu button reply / keyword and return the next step.
 *
 * @param {string} inputId  - interactive button ID or normalised text
 * @returns {string}        - next conversation step name
 */
function routeMainMenu(inputId) {
  switch (inputId) {
    case 'action_services':
    case 'services':
    case '1':
      return 'SERVICE_SELECT';

    case 'action_book':
    case 'book':
    case 'booking':
    case '2':
      return BUSINESS_TYPE === 'salon' ? 'SERVICE_SELECT' : 'BOOKING_DATE';

    case 'action_menu':
    case 'menu':
    case 'view menu':
      return 'MENU_VIEW';

    case 'action_order':
    case 'order':
    case '2':
      return 'ORDER_START';

    case 'action_help':
    case 'help':
    case '3':
      return 'HELP';

    default:
      return null; // unknown — stay on main menu
  }
}

async function sendHelp(to) {
  const helpLines =
    BUSINESS_TYPE === 'salon'
      ? ['*💇 View Services* — see what we offer & prices',
         '*📅 Book Appointment* — pick a service, date & time',
         '\nType *menu* at any time to return here.']
      : ['*🍽️ View Menu* — browse our full menu',
         '*🛒 Place Order* — add items and checkout',
         '\nType *menu* at any time to return here.'];

  await wa.sendText(to, '❓ *How to use this service:*\n\n' + helpLines.join('\n'));
}

module.exports = { sendWelcome, routeMainMenu, sendHelp, getBusiness, mainMenuButtons };
