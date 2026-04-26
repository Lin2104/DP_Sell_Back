const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Game = require('../models/Game');

router.get('/track/:orderId', async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('gameId', 'name icon');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const statusSteps = getStatusSteps(order.orderStatus, order.paymentStatus);

        const response = {
            orderId: order._id,
            gameName: order.gameId?.name || order.gameType,
            amount: order.amount,
            paymentMethod: order.paymentMethod,
            status: order.orderStatus,
            paymentStatus: order.paymentStatus,
            transactionId: order.transactionId,
            zoneId: order.zoneId,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            statusSteps,
            isCompleted: order.orderStatus === 'completed',
            isRejected: order.orderStatus === 'rejected'
        };

        res.json(response);
    } catch (err) {
        console.error('Order tracking error:', err);
        res.status(500).json({ error: 'Failed to fetch order status' });
    }
});

router.get('/track-by-transaction/:transactionId', async (req, res) => {
    try {
        const order = await Order.findOne({ transactionId: req.params.transactionId })
            .populate('gameId', 'name icon');

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const statusSteps = getStatusSteps(order.orderStatus, order.paymentStatus);

        res.json({
            orderId: order._id,
            gameName: order.gameId?.name || order.gameType,
            amount: order.amount,
            paymentMethod: order.paymentMethod,
            status: order.orderStatus,
            paymentStatus: order.paymentStatus,
            transactionId: order.transactionId,
            zoneId: order.zoneId,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            statusSteps,
            isCompleted: order.orderStatus === 'completed',
            isRejected: order.orderStatus === 'rejected'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch order status' });
    }
});

function getStatusSteps(orderStatus, paymentStatus) {
    const steps = [
        { id: 1, label: 'Order Received', completed: true, active: false },
        { id: 2, label: 'Payment Verified', completed: false, active: false },
        { id: 3, label: 'Processing', completed: false, active: false },
        { id: 4, label: 'Completed', completed: false, active: false }
    ];

    if (paymentStatus === 'paid' || paymentStatus === 'awaiting_payment') {
        steps[1].completed = true;
        steps[1].active = paymentStatus === 'awaiting_payment';
    }

    if (orderStatus === 'processing') {
        steps[2].active = true;
    }

    if (orderStatus === 'completed') {
        steps[1].completed = true;
        steps[2].completed = true;
        steps[3].completed = true;
        steps[3].active = true;
    }

    if (orderStatus === 'rejected') {
        steps[0].completed = false;
        steps[1].completed = false;
    }

    return steps;
}

module.exports = router;