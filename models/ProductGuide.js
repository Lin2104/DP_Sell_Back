const mongoose = require('mongoose');

const productGuideSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  setupGuide: {
    type: String,
    required: true
  },
  additionalInfo: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ProductGuide', productGuideSchema);
