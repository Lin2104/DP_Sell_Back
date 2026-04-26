const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  accountName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  logo: {
    type: String, // Base64 or URL
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);
