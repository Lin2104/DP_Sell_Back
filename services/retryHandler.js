const Order = require('../models/Order');
const smileoneService = require('./smileoneService');
const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

class RetryHandler {
    constructor() {
        this.redis = null;
        this.isInitialized = false;
        this.maxRetries = 3;
        this.baseDelay = 60000; // 1 minute
        this.bot = null;
    }

    setBot(botInstance) {
        this.bot = botInstance;
    }

    async initialize() {
        if (this.isInitialized) return;

        this.redis = new Redis({
            host: REDIS_HOST,
            port: REDIS_PORT,
            password: REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            lazyConnect: true
        });

        this.redis.on('error', () => {});
        this.isInitialized = true;
    }

    async recordFailure(orderId, error, source) {
        if (!this.redis) await this.initialize();

        const key = `retry:${orderId}`;
        const existing = await this.redis.get(key);

        let retryData = {
            attempts: 0,
            errors: [],
            lastAttempt: null,
            source
        };

        if (existing) {
            retryData = JSON.parse(existing);
        }

        retryData.attempts++;
        retryData.errors.push({ error, timestamp: Date.now() });
        retryData.lastAttempt = Date.now();

        await this.redis.setex(key, 3600, JSON.stringify(retryData)); // Expire in 1 hour

        return retryData;
    }

    async getRetryData(orderId) {
        if (!this.redis) await this.initialize();
        const key = `retry:${orderId}`;
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
    }

    async shouldRetry(orderId) {
        const retryData = await this.getRetryData(orderId);
        if (!retryData) return true;
        return retryData.attempts < this.maxRetries;
    }

    calculateDelay(attempts) {
        // Exponential backoff: 1min, 5min, 25min
        return this.baseDelay * Math.pow(5, attempts - 1);
    }

    async retryOrder(orderId) {
        const retryData = await this.getRetryData(orderId);
        if (!retryData || retryData.attempts >= this.maxRetries) {
            console.log(`[RetryHandler] Max retries reached for order ${orderId}`);
            await this.notifyMaxRetries(orderId, retryData);
            return { success: false, reason: 'max_retries' };
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return { success: false, reason: 'order_not_found' };
        }

        if (order.orderStatus === 'completed') {
            return { success: false, reason: 'already_completed' };
        }

        const delay = this.calculateDelay(retryData.attempts);
        const nextRetryTime = retryData.lastAttempt + delay;

        if (Date.now() < nextRetryTime) {
            return {
                success: false,
                reason: 'too_soon',
                nextRetryIn: nextRetryTime - Date.now()
            };
        }

        console.log(`[RetryHandler] Retrying order ${orderId} (attempt ${retryData.attempts + 1})`);

        try {
            if (retryData.source === 'smileone') {
                await smileoneService.addPurchaseJob(order);
            } else if (retryData.source === 'plati') {
                const { PlatiService } = require('./plati');
                const platiService = new PlatiService();
                await platiService.purchaseWithFirstAvailableUrl(
                    order._id.toString(),
                    order.platiUrls || [],
                    process.env.PLATI_EMAIL,
                    order.customerInfo?.email,
                    order.amount
                );
            }

            return { success: true, attempt: retryData.attempts + 1 };
        } catch (err) {
            await this.recordFailure(orderId, err.message, retryData.source);
            return { success: false, error: err.message };
        }
    }

    async notifyMaxRetries(orderId, retryData) {
        if (!this.bot || !process.env.ADMIN_CHAT_ID) return;

        const order = await Order.findById(orderId).populate('gameId');
        const gameName = order?.gameId?.name || order?.gameType || 'Unknown';

        const message =
            `🔴 <b>Order Automation Failed Permanently</b>\n\n` +
            `Order ID: <code>${orderId}</code>\n` +
            `Game: ${gameName}\n` +
            `Attempts: ${retryData?.attempts || 0}\n\n` +
            `All automation retries have been exhausted. Please handle this order manually.`;

        try {
            await this.bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, message, { parse_mode: 'HTML' });
        } catch (err) {
            console.error('[RetryHandler] Failed to notify admin:', err.message);
        }
    }

    async handleFailedJob(orderId, error, source = 'smileone') {
        const retryData = await this.recordFailure(orderId, error, source);

        if (retryData.attempts < this.maxRetries) {
            const delay = this.calculateDelay(retryData.attempts);
            console.log(`[RetryHandler] Scheduled retry for order ${orderId} in ${delay / 1000 / 60} minutes`);

            setTimeout(async () => {
                await this.retryOrder(orderId);
            }, delay);
        } else {
            await this.notifyMaxRetries(orderId, retryData);
        }
    }

    async getFailedOrders() {
        if (!this.redis) await this.initialize();

        const keys = await this.redis.keys('retry:*');
        const failedOrders = [];

        for (const key of keys) {
            const orderId = key.replace('retry:', '');
            const data = await this.redis.get(key);
            const retryData = JSON.parse(data);

            if (retryData.attempts < this.maxRetries) {
                failedOrders.push({
                    orderId,
                    ...retryData,
                    nextRetryIn: this.calculateDelay(retryData.attempts)
                });
            }
        }

        return failedOrders;
    }
}

module.exports = new RetryHandler();