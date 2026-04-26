const Order = require('../models/Order');
const Redis = require('ioredis');
const platiStockMonitor = require('./plati/stockMonitor');
const smileoneSessionManager = require('./smileone/sessionManager');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

class AutomationDashboard {
    constructor() {
        this.redis = null;
    }

    async getRedisStats() {
        try {
            this.redis = new Redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                password: REDIS_PASSWORD,
                maxRetriesPerRequest: null
            });

            await this.redis.ping();
            const info = await this.redis.info('memory');
            const dbSize = await this.redis.dbsize();

            return {
                connected: true,
                dbSize,
                memoryInfo: info
            };
        } catch {
            return { connected: false, error: 'Redis not available' };
        } finally {
            if (this.redis) await this.redis.quit();
        }
    }

    async getQueueStats(queueName) {
        try {
            this.redis = new Redis({
                host: REDIS_HOST,
                port: REDIS_PORT,
                password: REDIS_PASSWORD,
                maxRetriesPerRequest: null
            });

            const { Queue } = require('bullmq');
            const queue = new Queue(queueName, {
                connection: {
                    host: REDIS_HOST,
                    port: REDIS_PORT,
                    password: REDIS_PASSWORD
                }
            });

            const [waiting, active, completed, failed] = await Promise.all([
                queue.getWaitingCount(),
                queue.getActiveCount(),
                queue.getCompletedCount(),
                queue.getFailedCount()
            ]);

            return { queueName, waiting, active, completed, failed };
        } catch (err) {
            return { queueName, error: err.message };
        }
    }

    async getTodayStats() {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const orders = await Order.find({
            createdAt: { $gte: startOfDay }
        });

        const stats = {
            total: orders.length,
            completed: orders.filter(o => o.orderStatus === 'completed').length,
            processing: orders.filter(o => o.orderStatus === 'processing').length,
            pending: orders.filter(o => o.orderStatus === 'pending' || o.orderStatus === 'awaiting_payment').length,
            rejected: orders.filter(o => o.orderStatus === 'rejected').length
        };

        stats.successRate = stats.total > 0
            ? ((stats.completed / stats.total) * 100).toFixed(1)
            : 0;

        return stats;
    }

    async getFailedOrdersStats() {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const failedOrders = await Order.find({
            orderStatus: 'rejected',
            updatedAt: { $gte: oneDayAgo }
        }).limit(10);

        return {
            count: failedOrders.length,
            recent: failedOrders.map(o => ({
                orderId: o._id,
                gameType: o.gameType,
                amount: o.amount,
                reason: o.automationErrors?.[0]?.message || 'Manual rejection'
            }))
        };
    }

    async getAllStats() {
        const [
            redisStats,
            smileoneQueue,
            platiQueue,
            todayStats,
            failedOrdersStats,
            stockStatus
        ] = await Promise.all([
            this.getRedisStats(),
            this.getQueueStats('smileone-purchases'),
            this.getQueueStats('plati-purchases'),
            this.getTodayStats(),
            this.getFailedOrdersStats(),
            Promise.resolve(platiStockMonitor.lastStockStatus ? Object.fromEntries(platiStockMonitor.lastStockStatus) : {})
        ]);

        return {
            timestamp: new Date().toISOString(),
            redis: redisStats,
            queues: {
                smileone: smileoneQueue,
                plati: platiQueue
            },
            today: todayStats,
            failedOrders: failedOrdersStats,
            stockMonitor: stockStatus,
            smileoneSession: smileoneSessionManager.lastCheck
                ? { lastCheck: smileoneSessionManager.lastCheck, isLoggedIn: smileoneSessionManager.isLoggedIn }
                : { status: 'not_checked' }
        };
    }
}

module.exports = new AutomationDashboard();