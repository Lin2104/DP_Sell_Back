const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  gameType: {
    type: String,
    required: true
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false
  },
  zoneId: {
    type: String,
    required: false // Only for Mobile Legends
  },
  amount: {
    type: String,
    required: true
  },
  paymentMethod: {
    type: String, // Dynamic from payment method name
    required: true
  },
  transactionScreenshot: {
    type: String, // Base64 or URL
    required: false
  },
  transactionId: {
    type: String,
    required: false
  },
  paymentScreenshot: {
    type: String, // Path or URL to screenshot
    required: false
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'awaiting_payment', 'paid', 'rejected'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'awaiting_payment', 'processing', 'completed', 'failed', 'rejected'],
    default: 'pending'
  },
  customerInfo: {
    name: String,
    email: String,
    telegramId: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  },
  platiOrderId: {
    type: String,
    required: false
  },
  platiUrl: {
    type: String,
    required: false
  },
  automationErrors: [{
    type: String,
    message: String,
    timestamp: Date,
    priority: String,
    resolved: Boolean
  }],
  refundInfo: {
    reason: String,
    amount: Number,
    refundedAt: Date,
    refundId: String
  },
  adminNotification: {
    message: String,
    timestamp: Date,
    requiresAction: Boolean
  },
  retryInfo: {
    attemptedAt: Date,
    previousErrors: Array
  },
  rejectionReason: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster querying
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ platiOrderId: 1 });
orderSchema.index({ 'refundInfo.refundedAt': 1 });

module.exports = mongoose.model('Order', orderSchema);
