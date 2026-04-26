const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  name: {
    type: String,
    required: true, // e.g. "100 Diamonds"
  },
  price: {
    type: Number,
    required: true, // e.g. 1500 (MMK)
  },
  icon: {
    type: String, // Base64 or URL
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  platiUrls: [{
    type: String,
    required: false
  }],
  isDigital: {
    type: Boolean,
    default: false
  }
});

// Add indexes for faster querying
productSchema.index({ gameId: 1 });
productSchema.index({ isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
