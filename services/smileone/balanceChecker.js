// Playwright disabled for Render compatibility
// const { chromium } = require('playwright');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '../../browser_data/smileone');

class SmileOneBalanceChecker {
  constructor() {
    this.bot = null;
    this.minBalanceThreshold = 10; // Default threshold in Smile Coins
  }

  setBot(botInstance) {
    this.bot = botInstance;
  }

  async getBalance() {
    console.warn('[SmileOneBalance] Browser-based balance check is disabled on Render.');
    return null;
  }

  async alertLowBalance(balance) {
    if (this.bot && process.env.ADMIN_CHAT_ID) {
      try {
        await this.bot.telegram.sendMessage(
          process.env.ADMIN_CHAT_ID,
          `⚠️ <b>LOW BALANCE ALERT (SmileOne)</b>\n\n` +
          `Your Smile One Brazil balance is low: <b>${balance}</b>\n\n` +
          `Please top up your account to ensure automation continues working.`,
          { parse_mode: 'HTML' }
        );
      } catch (err) {
        console.error('[SmileOneBalance] Failed to alert admin:', err.message);
      }
    }
  }
}

module.exports = new SmileOneBalanceChecker();