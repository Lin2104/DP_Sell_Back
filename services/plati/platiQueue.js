const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const PlatiBrowser = require('./platiBrowser');
const PlatiPayment = require('./platiPayment');
const PlatiScraper = require('./platiScraper');
const PlatiEmail = require('./platiEmail');
const retryHandler = require('../retryHandler');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

class PlatiQueue {
    constructor(options = {}) {
        this.redisOptions = {
            host: options.redisHost || REDIS_HOST,
            port: options.redisPort || REDIS_PORT,
            password: options.redisPassword || process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            lazyConnect: true,
            connectTimeout: 10000,
            retryStrategy: () => null
        };

        this.purchaseQueue = null;
        this.emailQueue = null;
        this.stockCheckQueue = null;

        this.workers = [];
        this.isInitialized = false;
        this.connection = null;
        this.isConnected = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        this.connection = new Redis(this.redisOptions);

        // Handle error event to prevent "Unhandled error event" crash logs
        this.connection.on('error', (err) => {
            // Silently catch connection errors as we have fallback logic
        });

        try {
            await this.connection.ping();
            this.isConnected = true;
        } catch (err) {
            console.warn('Redis connection failed:', err.message);
            this.isConnected = false;
            throw new Error('Redis not available');
        }

        this.purchaseQueue = new Queue('plati-purchases', { connection: this.connection });
        this.emailQueue = new Queue('plati-emails', { connection: this.connection });
        this.stockCheckQueue = new Queue('plati-stock-checks', { connection: this.connection });

        this.purchaseWorker = new Worker('plati-purchases', async (job) => {
            return await this.processPurchaseJob(job);
        }, { connection: this.connection, concurrency: 2 });

        this.emailWorker = new Worker('plati-emails', async (job) => {
            return await this.processEmailJob(job);
        }, { connection: this.connection, concurrency: 5 });

        this.stockCheckWorker = new Worker('plati-stock-checks', async (job) => {
            return await this.processStockCheckJob(job);
        }, { connection: this.connection, concurrency: 10 });

        this.purchaseWorker.on('completed', (job, result) => {
            console.log(`Purchase job ${job.id} completed:`, result);
        });

        this.purchaseWorker.on('failed', async (job, err) => {
            console.error(`Purchase job ${job?.id} failed:`, err.message);
            if (job?.data?.orderId) {
              await retryHandler.handleFailedJob(job.data.orderId, err.message, 'plati');
            }
        });

        this.emailWorker.on('failed', (job, err) => {
            console.error(`Email job ${job?.id} failed:`, err.message);
        });

        this.isInitialized = true;
        console.log('PlatiQueue workers initialized');
    }

    async processPurchaseJob(job) {
        const { orderId, productUrl, buyerEmail, customerEmail, amount, fallbackUrls } = job.data;

        const browser = new PlatiBrowser({ headless: true });
        const payment = new PlatiPayment();
        const emailService = new PlatiEmail();
        const allUrls = fallbackUrls ? [productUrl, ...fallbackUrls] : [productUrl];

        let activeUrl = productUrl;

        try {
            await browser.launch();

            await job.updateProgress(10);
            let stockCheck = await browser.checkStock(activeUrl);

            if (!stockCheck.inStock && fallbackUrls && fallbackUrls.length > 0) {
                for (const url of fallbackUrls) {
                    stockCheck = await browser.checkStock(url);
                    if (stockCheck.inStock) {
                        activeUrl = url;
                        break;
                    }
                }
            }

            if (!stockCheck.inStock) {
                throw new Error('PRODUCT_OUT_OF_STOCK');
            }

            await job.updateProgress(20);
            const loginSuccess = await browser.login(
                process.env.PLATI_EMAIL
            );
            if (!loginSuccess) {
                throw new Error('PLATI_LOGIN_FAILED');
            }

            await job.updateProgress(30);
            const purchaseResult = await browser.purchaseProduct(activeUrl, buyerEmail);

            if (purchaseResult.requiresManualAction) {
                await job.updateProgress(50);

                const paymentLink = await payment.createPaymentLink(
                    orderId,
                    amount,
                    `Plati purchase - Order ${orderId}`
                );

                return {
                    success: true,
                    requiresManualPayment: true,
                    paymentUrl: paymentLink.paymentUrl,
                    qrCode: paymentLink.qrCode,
                    redirectUrl: purchaseResult.redirectUrl
                };
            }

            await job.updateProgress(60);
            await browser.waitForElement('.order-confirmation, .success, [class*="success"]', 120000);

            await job.updateProgress(70);
            const scraper = new PlatiScraper(browser);
            const purchaseDetails = await scraper.scrapeRecentPurchase();

            await job.updateProgress(80);
            if (purchaseDetails?.details) {
                await emailService.sendProductEmail(customerEmail, { orderId }, purchaseDetails.details);
            }

            await job.updateProgress(100);

            return {
                success: true,
                orderId,
                purchaseDetails
            };

        } catch (error) {
            console.error(`Purchase job ${job.id} error:`, error);

            if (error.message === 'PRODUCT_OUT_OF_STOCK') {
                return {
                    success: false,
                    error: 'PRODUCT_OUT_OF_STOCK',
                    needsRefund: true
                };
            }

            throw error;
        } finally {
            await browser.close();
        }
    }

    async processEmailJob(job) {
        const { type, customerEmail, orderDetails, productDetails } = job.data;

        const emailService = new PlatiEmail();

        if (type === 'delivery') {
            const result = await emailService.sendProductEmail(customerEmail, orderDetails, productDetails);
            return result;
        }

        if (type === 'confirmation') {
            return await emailService.sendOrderConfirmation(customerEmail, orderDetails);
        }

        if (type === 'refund') {
            return await emailService.sendRefundNotification(
                customerEmail,
                orderDetails,
                productDetails.reason
            );
        }

        throw new Error(`Unknown email job type: ${type}`);
    }

    async processStockCheckJob(job) {
        const { productUrl, interval = 600000 } = job.data;

        const browser = new PlatiBrowser({ headless: true });

        try {
            await browser.launch();
            const result = await browser.checkStock(productUrl);
            return result;
        } finally {
            await browser.close();
        }
    }

    async addPurchaseJob(orderId, productUrl, buyerEmail, customerEmail, amount, fallbackUrls = null) {
        if (!this.isConnected || !this.purchaseQueue) {
            throw new Error('Queue not connected');
        }

        const job = await this.purchaseQueue.add('purchase', {
            orderId,
            productUrl,
            buyerEmail,
            customerEmail,
            amount,
            fallbackUrls
        }, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });

        return job.id;
    }

    async addEmailJob(type, customerEmail, orderDetails, productDetails = {}) {
        if (!this.isConnected || !this.emailQueue) {
            throw new Error('Queue not connected');
        }

        const job = await this.emailQueue.add('email', {
            type,
            customerEmail,
            orderDetails,
            productDetails
        }, {
            attempts: 3,
            backoff: {
                type: 'fixed',
                delay: 2000
            },
            removeOnComplete: 100,
            removeOnFail: 1000
        });

        return job.id;
    }

    async addStockCheckJob(productUrl, interval = 600000) {
        if (!this.isConnected || !this.stockCheckQueue) {
            throw new Error('Queue not connected');
        }

        const job = await this.stockCheckQueue.add('stock-check', {
            productUrl,
            interval
        }, {
            repeat: {
                every: interval
            },
            removeOnComplete: 10,
            removeOnFail: 100
        });

        return job.id;
    }

    async getJobStatus(jobId, queueName = 'plati-purchases') {
        const queue = queueName === 'plati-purchases' ? this.purchaseQueue : this.emailQueue;
        if (!queue) return null;

        const job = await queue.getJob(jobId);

        if (!job) return null;

        const state = await job.getState();
        const progress = job.progress;

        return {
            id: job.id,
            state,
            progress,
            data: job.data,
            result: job.returnvalue,
            failedReason: job.failedReason
        };
    }

    async close() {
        if (this.purchaseWorker) await this.purchaseWorker.close();
        if (this.emailWorker) await this.emailWorker.close();
        if (this.stockCheckWorker) await this.stockCheckWorker.close();
        if (this.connection) await this.connection.quit();
        this.isInitialized = false;
        this.isConnected = false;
    }
}

module.exports = PlatiQueue;