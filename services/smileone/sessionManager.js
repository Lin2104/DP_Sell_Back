// Playwright disabled for Render compatibility
// const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;

const USER_DATA_DIR = path.join(__dirname, '../../browser_data/smileone');
const SESSION_FILE = path.join(USER_DATA_DIR, 'session_state.json');

class SmileOneSessionManager {
    constructor() {
        this.isLoggedIn = false;
        this.lastCheck = null;
        this.sessionExpiresAt = null;
        this.bot = null;
    }

    setBot(botInstance) {
        this.bot = botInstance;
    }

    async checkSession() {
        console.warn('[SmileOneSession] Browser-based session check is disabled on Render.');
        return { isLoggedIn: false, disabled: true };
    }

    async saveSessionState(state) {
        try {
            await fs.mkdir(USER_DATA_DIR, { recursive: true });
            await fs.writeFile(SESSION_FILE, JSON.stringify(state, null, 2));
        } catch (err) {
            console.error('[SmileOneSession] Failed to save session state:', err.message);
        }
    }

    async loadSessionState() {
        try {
            const data = await fs.readFile(SESSION_FILE, 'utf8');
            return JSON.parse(data);
        } catch {
            return null;
        }
    }

    async alertAdmin(message) {
        if (this.bot && process.env.ADMIN_CHAT_ID) {
            try {
                await this.bot.telegram.sendMessage(
                    process.env.ADMIN_CHAT_ID,
                    `⚠️ <b>SmileOne Session Alert</b>\n\n${message}`,
                    { parse_mode: 'HTML' }
                );
            } catch (err) {
                console.error('[SmileOneSession] Failed to alert admin:', err.message);
            }
        }
    }

    async startMonitoring(intervalMinutes = 30) {
        console.log(`[SmileOneSession] Starting session monitoring (every ${intervalMinutes} minutes)`);

        const checkInterval = setInterval(async () => {
            const result = await this.checkSession();

            if (!result.isLoggedIn) {
                await this.alertAdmin(
                    '🔴 <b>SmileOne Session Expired!</b>\n\n' +
                    'The Google login session has expired. Please log in manually in the browser that will open.\n\n' +
                    '⚡ Action Required: Run the SmileOne login script to refresh the session.'
                );
            }
        }, intervalMinutes * 60 * 1000);

        return () => clearInterval(checkInterval);
    }

    async requireLogin() {
        const state = await this.loadSessionState();
        if (state && !state.isLoggedIn) {
            await this.alertAdmin(
                '🔴 <b>SmileOne Login Required!</b>\n\n' +
                'The automation cannot proceed because you are not logged into SmileOne.\n\n' +
                'Please log in manually at https://www.smile.one/br/'
            );
            return false;
        }
        return true;
    }
}

module.exports = new SmileOneSessionManager();