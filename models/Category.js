const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    enum: ['top-up', 'digital-product'],
    default: 'top-up'
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Category', categorySchema);
