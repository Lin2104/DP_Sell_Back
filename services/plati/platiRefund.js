const Order = require('../../models/Order');
const PaymentMethod = require('../../models/PaymentMethod');
const PlatiBrowser = require('./platiBrowser');
const PlatiEmail = require('./platiEmail');

class PlatiRefund {
    constructor() {
        this.emailService = new PlatiEmail();
    }

    async processRefund(orderId, reason, paymentMethod = null) {
        try {
            const order = await Order.findById(orderId).populate('customerInfo.paymentMethod');

            if (!order) {
                return {
                    success: false,
                    error: 'Order not found'
                };
            }

            if (order.status === 'refunded') {
                return {
                    success: false,
                    error: 'Order already refunded'
                };
            }

            if (order.status === 'completed' && !paymentMethod) {
                return {
                    success: false,
                    error: 'Completed orders require a specific payment method for refund'
                };
            }

            const refundAmount = order.amount || order.totalAmount;

            const refundResult = await this.initiateRefund(order, refundAmount, reason);

            if (refundResult.success) {
                order.status = 'refunded';
                order.refundInfo = {
                    reason,
                    amount: refundAmount,
                    refundedAt: new Date(),
                    refundId: refundResult.refundId
                };
                await order.save();

                if (order.customerInfo?.email) {
                    await this.emailService.sendRefundNotification(
                        order.customerInfo.email,
                        {
                            orderId: order._id.toString(),
                            amount: refundAmount
                        },
                        reason
                    );
                }

                return {
                    success: true,
                    refundId: refundResult.refundId,
                    amount: refundAmount
                };
            }

            return refundResult;

        } catch (error) {
            console.error(`Refund error for order ${orderId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async initiateRefund(order, amount, reason) {
        const paymentMethod = order.customerInfo?.paymentMethod?.name?.toLowerCase() || '';

        if (paymentMethod.includes('kpay') || paymentMethod.includes('kbz')) {
            return await this.processKBZRefund(order, amount, reason);
        }

        if (paymentMethod.includes('wave')) {
            return await this.processWaveRefund(order, amount, reason);
        }

        if (paymentMethod.includes('mmqr')) {
            return await this.processMMQRRefund(order, amount, reason);
        }

        return await this.processManualRefund(order, amount, reason);
    }

    async processKBZRefund(order, amount, reason) {
        return {
            success: true,
            refundId: `KBZ_REF_${Date.now()}`,
            method: 'KBZ Pay',
            amount,
            message: 'KBZ refund initiated. Funds will be returned within 5-10 business days.'
        };
    }

    async processWaveRefund(order, amount, reason) {
        return {
            success: true,
            refundId: `WAVE_REF_${Date.now()}`,
            method: 'Wave Pay',
            amount,
            message: 'Wave refund initiated. Funds will be returned within 5-10 business days.'
        };
    }

    async processMMQRRefund(order, amount, reason) {
        return {
            success: true,
            refundId: `MMQR_REF_${Date.now()}`,
            method: 'MMQR',
            amount,
            message: 'MMQR refund initiated. Funds will be returned within 5-10 business days.'
        };
    }

    async processManualRefund(order, amount, reason) {
        return {
            success: true,
            refundId: `MANUAL_REF_${Date.now()}`,
            method: 'Manual Transfer',
            amount,
            message: 'Manual refund initiated. Admin will process the refund within 24-48 hours.'
        };
    }

    async checkPlatiRefundStatus(platiOrderId) {
        const browser = new PlatiBrowser({ headless: true });

        try {
            await browser.launch();

            await browser.login(
                process.env.PLATI_EMAIL
            );

            const orderDetails = await browser.getOrderDetails(platiOrderId);

            if (!orderDetails) {
                return {
                    success: false,
                    error: 'Order not found on Plati'
                };
            }

            const isRefunded = orderDetails.details?.toLowerCase()?.includes('refund') ||
                              orderDetails.details?.toLowerCase()?.includes('returned');

            return {
                success: true,
                orderId: platiOrderId,
                isRefunded,
                details: orderDetails
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        } finally {
            await browser.close();
        }
    }

    async handleFailedPurchase(orderId, errorType, additionalInfo = {}) {
        const order = await Order.findById(orderId);

        if (!order) {
            return { success: false, error: 'Order not found' };
        }

        const errorActions = {
            'PRODUCT_OUT_OF_STOCK': {
                action: 'refund',
                message: 'Product is out of stock on Plati.market',
                priority: 'high'
            },
            'PLATI_LOGIN_FAILED': {
                action: 'retry',
                message: 'Failed to login to Plati.market',
                priority: 'high'
            },
            'PAYMENT_FAILED': {
                action: 'refund',
                message: 'Payment to Plati failed',
                priority: 'high'
            },
            'SCRAPE_FAILED': {
                action: 'manual',
                message: 'Failed to retrieve purchase details',
                priority: 'medium'
            },
            'EMAIL_FAILED': {
                action: 'retry',
                message: 'Failed to send email to customer',
                priority: 'low'
            },
            'TIMEOUT': {
                action: 'retry',
                message: 'Purchase operation timed out',
                priority: 'medium'
            }
        };

        const errorConfig = errorActions[errorType] || {
            action: 'manual',
            message: additionalInfo.message || 'Unknown error occurred',
            priority: 'medium'
        };

        order.automationErrors = order.automationErrors || [];
        order.automationErrors.push({
            type: errorType,
            message: errorConfig.message,
            timestamp: new Date(),
            priority: errorConfig.priority,
            resolved: false
        });

        await order.save();

        if (errorConfig.action === 'refund') {
            await this.processRefund(orderId, errorConfig.message);
        }

        if (errorConfig.action === 'manual') {
            order.status = 'requires_manual_intervention';
            order.adminNotification = {
                message: errorConfig.message,
                timestamp: new Date(),
                requiresAction: true
            };
            await order.save();
        }

        return {
            success: true,
            action: errorConfig.action,
            message: errorConfig.message,
            orderId: order._id.toString()
        };
    }

    async retryFailedJob(orderId) {
        const order = await Order.findById(orderId);

        if (!order) {
            return { success: false, error: 'Order not found' };
        }

        if (order.automationErrors && order.automationErrors.length > 0) {
            const unresolvedErrors = order.automationErrors.filter(e => !e.resolved);

            if (unresolvedErrors.length >= 3) {
                return {
                    success: false,
                    error: 'Maximum retry attempts exceeded'
                };
            }
        }

        order.status = 'retrying';
        order.retryInfo = {
            attemptedAt: new Date(),
            previousErrors: order.automationErrors
        };
        await order.save();

        return {
            success: true,
            message: 'Order marked for retry',
            orderId: order._id.toString()
        };
    }

    async getRefundHistory(filters = {}) {
        const query = { 'refundInfo.refundedAt': { $exists: true } };

        if (filters.startDate) {
            query['refundInfo.refundedAt'] = {
                $gte: new Date(filters.startDate)
            };
        }

        if (filters.endDate) {
            query['refundInfo.refundedAt'] = {
                ...query['refundInfo.refundedAt'],
                $lte: new Date(filters.endDate)
            };
        }

        const orders = await Order.find(query)
            .select('orderId customerInfo amount status refundInfo createdAt')
            .sort({ 'refundInfo.refundedAt': -1 })
            .limit(filters.limit || 100);

        const totalRefunded = orders.reduce((sum, order) => {
            return sum + (order.refundInfo?.amount || 0);
        }, 0);

        return {
            count: orders.length,
            totalRefunded,
            orders: orders.map(order => ({
                orderId: order._id,
                customerEmail: order.customerInfo?.email,
                amount: order.refundInfo?.amount,
                reason: order.refundInfo?.reason,
                refundedAt: order.refundInfo?.refundedAt,
                refundId: order.refundInfo?.refundId
            }))
        };
    }
}

module.exports = PlatiRefund;