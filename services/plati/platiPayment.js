const axios = require('axios');
const crypto = require('crypto');

class PlatiPayment {
    constructor(options = {}) {
        this.merchantId = options.merchantId || process.env.BINANCE_MERCHANT_ID;
        this.apiKey = options.apiKey || process.env.BINANCE_API_KEY;
        this.secretKey = options.secretKey || process.env.BINANCE_SECRET_KEY;
        this.environment = options.environment || process.env.BINANCE_ENVIRONMENT || 'production';
        this.baseUrl = this.environment === 'sandbox'
            ? 'https://sandbox.binancepay.com'
            : 'https://bpay.binanceapi.com';
    }

    generateSignature(payload, secretKey) {
        const hmac = crypto.createHmac('sha256', secretKey);
        hmac.update(JSON.stringify(payload));
        return hmac.digest('hex');
    }

    verifySignature(payload, signature) {
        const expectedSignature = this.generateSignature(payload, this.secretKey);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    async createInvoice(orderId, amount, currency = 'USDT', description = '') {
        const payload = {
            env: {
                terminalType: 'WEB'
            },
            orderAmount: amount,
            currency,
            orderId: orderId.toString(),
            merchantId: this.merchantId,
            description: description || `Plati.market purchase - Order ${orderId}`,
            timeoutUrl: process.env.PLATI_CALLBACK_URL || 'https://yourdomain.com/payment/callback'
        };

        const signature = this.generateSignature(payload, this.secretKey);

        try {
            const response = await axios.post(`${this.baseUrl}/binancepay/openapi/v2/order`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'BinancePay-Certificate-Signature': signature,
                    'BinancePay-Merchant-Id': this.merchantId,
                    'BinancePay-Signature': signature
                },
                timeout: 30000
            });

            return {
                success: true,
                data: response.data,
                checkoutUrl: response.data?.data?.checkoutUrl
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    async queryOrder(orderId) {
        const payload = {
            merchantId: this.merchantId,
            orderId: orderId.toString()
        };

        const signature = this.generateSignature(payload, this.secretKey);

        try {
            const response = await axios.post(`${this.baseUrl}/binancepay/openapi/v2/query`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'BinancePay-Certificate-Signature': signature,
                    'BinancePay-Merchant-Id': this.merchantId,
                    'BinancePay-Signature': signature
                },
                timeout: 15000
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    async createPaymentLink(orderId, amount, productDetails) {
        const payload = {
            env: {
                terminalType: 'APP'
            },
            orderAmount: amount,
            currency: 'USDT',
            orderId: `PLATI_${orderId}_${Date.now()}`,
            merchantId: this.merchantId,
            description: productDetails.substring(0, 128),
            returnUrl: process.env.PLATI_RETURN_URL || 'https://yourdomain.com/order/complete',
            callbackUrl: process.env.PLATI_WEBHOOK_URL || 'https://yourdomain.com/api/payment/webhook'
        };

        const signature = this.generateSignature(payload, this.secretKey);

        try {
            const response = await axios.post(`${this.baseUrl}/binancepay/openapi/v2/order`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'BinancePay-Certificate-Signature': signature,
                    'BinancePay-Merchant-Id': this.merchantId,
                    'BinancePay-Signature': signature
                },
                timeout: 30000
            });

            return {
                success: true,
                paymentUrl: response.data?.data?.checkoutUrl,
                qrCode: response.data?.data?.qrCode,
                transactionId: response.data?.data?.transactionId
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    parseBinanceCallback(callbackData) {
        if (!callbackData || !callbackData.data) {
            return { valid: false, error: 'Invalid callback data' };
        }

        const { data, signature } = callbackData;

        if (!this.verifySignature(data, signature)) {
            return { valid: false, error: 'Invalid signature' };
        }

        return {
            valid: true,
            orderId: data.orderId,
            amount: data.orderAmount,
            currency: data.currency,
            status: data.status,
            transactionId: data.transactionId,
            payerId: data.payerId
        };
    }

    async handleManualPayment(page) {
        const paymentInfo = {
            status: 'pending',
            qrCodeUrl: null,
            paymentLink: null
        };

        try {
            const qrCodeElement = await page.$('img[src*="qr"], img[class*="qr"], canvas');
            if (qrCodeElement) {
                paymentInfo.qrCodeUrl = await qrCodeElement.getAttribute('src');
            }

            const paymentLinkElement = await page.$('a[href*="binance"], button[onclick*="binance"]');
            if (paymentLinkElement) {
                paymentInfo.paymentLink = await paymentLinkElement.getAttribute('href');
            }

            const qrTextElement = await page.$('[class*="qr-text"], [class*="qrcode"]');
            if (qrTextElement) {
                paymentInfo.qrText = await qrTextElement.textContent();
            }

            const statusElement = await page.$('[class*="status"], [class*="payment-status"]');
            if (statusElement) {
                paymentInfo.status = await statusElement.textContent();
            }

            return {
                success: true,
                data: paymentInfo
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async checkPaymentStatus(page, expectedAmount) {
        await page.waitForTimeout(5000);

        const pageContent = await page.content();
        const successIndicators = [
            'payment successful',
            'payment complete',
            'order confirmed',
            'thank you',
            'success'
        ];

        const failureIndicators = [
            'payment failed',
            'payment declined',
            'payment cancelled',
            'insufficient funds',
            'error'
        ];

        const lowerContent = pageContent.toLowerCase();

        for (const indicator of successIndicators) {
            if (lowerContent.includes(indicator)) {
                return { status: 'success', confirmed: true };
            }
        }

        for (const indicator of failureIndicators) {
            if (lowerContent.includes(indicator)) {
                return { status: 'failed', confirmed: false };
            }
        }

        return { status: 'pending', confirmed: false };
    }
}

module.exports = PlatiPayment;