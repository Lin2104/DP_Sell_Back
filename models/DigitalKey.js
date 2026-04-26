const mongoose = require('mongoose');

const digitalKeySchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  key: {
    type: String,
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for finding unused keys for a game quickly
digitalKeySchema.index({ gameId: 1, isUsed: 1 });

module.exports = mongoose.model('DigitalKey', digitalKeySchema);
