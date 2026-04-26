const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  icon: {
    type: String, // Base64
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  benefits: {
    type: [String],
    default: ['Full access and 100% guarantee', 'Instant delivery after payment', 'Secure payment methods only', '24/7 Support available']
  },
  purchaseInfo: {
    type: [String],
    default: ['Detailed instructions for activation', 'Login credentials or license key', 'Customer support for any issues']
  },
  trailerUrl: {
    type: String, // Youtube link
    required: false
  },
  systemRequirements: {
    os: String,
    processor: String,
    memory: String,
    graphics: String,
    storage: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  soldCount: {
    type: Number,
    default: 0
  },
  inputConfig: [{
    label: String,
    placeholder: String,
    key: String, // e.g., 'userId', 'zoneId'
    required: { type: Boolean, default: true }
  }],
  platiUrls: [{
    type: String,
    required: false
  }]
});

// Add indexes for faster querying
gameSchema.index({ categoryId: 1 });
gameSchema.index({ isActive: 1 });

module.exports = mongoose.model('Game', gameSchema);
