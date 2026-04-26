const PlatiBrowser = require('./platiBrowser');
const PlatiPayment = require('./platiPayment');
const PlatiScraper = require('./platiScraper');
const PlatiEmail = require('./platiEmail');
const PlatiQueue = require('./platiQueue');
const PlatiRefund = require('./platiRefund');

class PlatiService {
    constructor(options = {}) {
        this.browser = null;
        this.payment = new PlatiPayment(options.payment);
        this.email = new PlatiEmail(options.email);
        this.queue = new PlatiQueue(options.redis);
        this.refund = new PlatiRefund();
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            await this.queue.initialize();
            this.isInitialized = true;
            console.log('PlatiService fully initialized');
        } catch (error) {
            console.warn('PlatiService queue initialization failed. Automation disabled:', error.message);
            this.queueDisabled = true;
            this.isInitialized = true;
        }
    }

    async checkStock(productUrl) {
        const browser = new PlatiBrowser({ headless: true });
        try {
            await browser.launch();
            const result = await browser.checkStock(productUrl);
            return result;
        } finally {
            await browser.close();
        }
    }

    async checkMultipleUrlsStock(urls) {
        const browser = new PlatiBrowser({ headless: true });
        try {
            await browser.launch();
            for (const url of urls) {
                const result = await browser.checkStock(url);
                if (result.inStock) {
                    return { inStock: true, availableUrl: url, allChecked: false };
                }
            }
            return { inStock: false, availableUrl: null, allChecked: true, checkedUrls: urls.length };
        } finally {
            await browser.close();
        }
    }

    async purchaseWithFirstAvailableUrl(orderId, urls, buyerEmail, customerEmail, amount) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.queueDisabled) {
            return {
                success: false,
                error: 'Redis/Queue is not available. Plati automation is disabled.',
                orderId
            };
        }

        const jobId = await this.queue.addPurchaseJob(
            orderId,
            urls[0],
            buyerEmail,
            customerEmail,
            amount,
            urls
        );

        return {
            success: true,
            jobId,
            orderId,
            message: 'Purchase job added to queue'
        };
    }

    async purchaseProduct(orderId, productUrl, buyerEmail, customerEmail, amount) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const jobId = await this.queue.addPurchaseJob(
            orderId,
            productUrl,
            buyerEmail,
            customerEmail,
            amount
        );

        return {
            success: true,
            jobId,
            orderId,
            message: 'Purchase job added to queue'
        };
    }

    async getPurchaseStatus(jobId) {
        return await this.queue.getJobStatus(jobId);
    }

    async handlePaymentCallback(callbackData) {
        const parsed = this.payment.parseBinanceCallback(callbackData);

        if (!parsed.valid) {
            return { success: false, error: parsed.error };
        }

        const jobData = await this.queue.getJobStatus(parsed.orderId);

        if (jobData && jobData.data) {
            const { customerEmail, orderId } = jobData.data;

            if (parsed.status === 'COMPLETED') {
                const browser = new PlatiBrowser({ headless: true });
                try {
                    await browser.launch();
                    const scraper = new PlatiScraper(browser);
                    const purchaseDetails = await scraper.scrapeRecentPurchase(orderId);

                    if (purchaseDetails?.details) {
                        await this.email.sendProductEmail(
                            customerEmail,
                            { orderId },
                            purchaseDetails.details
                        );
                    }

                    return {
                        success: true,
                        orderId: parsed.orderId,
                        purchaseDetails
                    };
                } finally {
                    await browser.close();
                }
            }
        }

        return {
            success: true,
            orderId: parsed.orderId,
            status: parsed.status
        };
    }

    async processRefund(orderId, reason, paymentMethod) {
        return await this.refund.processRefund(orderId, reason, paymentMethod);
    }

    async retryOrder(orderId) {
        return await this.refund.retryFailedJob(orderId);
    }

    async getRefundHistory(filters) {
        return await this.refund.getRefundHistory(filters);
    }

    async close() {
        await this.queue.close();
        this.isInitialized = false;
    }
}

module.exports = {
    PlatiService,
    PlatiBrowser,
    PlatiPayment,
    PlatiScraper,
    PlatiEmail,
    PlatiQueue,
    PlatiRefund
};