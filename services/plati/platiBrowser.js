// Playwright disabled for Render compatibility
// const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const PlatiEmailListener = require('./platiEmailListener');
const proxyManager = require('../proxyManager');

class PlatiBrowser {
    constructor(options = {}) {
        this.headless = options.headless !== false;
        this.userDataDir = options.userDataDir || path.join(__dirname, '../../browser_data');
        this.proxy = options.proxy || proxyManager.getProxyObject();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.isLoggedIn = false;
        this.emailListener = new PlatiEmailListener();
    }

    async launch() {
        console.warn('[PlatiBrowser] Browser automation is disabled on Render environment.');
        throw new Error('BROWSER_AUTOMATION_DISABLED');
    }

    async close() {
        if (this.emailListener) await this.emailListener.stop().catch(() => {});
    }

    async login(email) {
        throw new Error('BROWSER_AUTOMATION_DISABLED');
    }

    async checkLoginStatus() {
        return false;
    }

    async checkStock(productUrl) {
        throw new Error('BROWSER_AUTOMATION_DISABLED');
    }

    async purchaseProduct(productUrl, buyerEmail, paymentMethod = 'binance') {
        throw new Error('BROWSER_AUTOMATION_DISABLED');
    }

    async getOrderDetails(orderId) {
        throw new Error('BROWSER_AUTOMATION_DISABLED');
    }

    async waitForElement(selector, timeout = 30000) {
        return false;
    }

    async takeScreenshot(filename) {
        return null;
    }
}

module.exports = PlatiBrowser;
