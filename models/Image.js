const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  data: {
    type: String, // Base64 string
    required: true
  },
  contentType: {
    type: String, // e.g., image/png, image/jpeg
    required: true
  },
  originalName: {
    type: String,
    required: false
  },
  size: {
    type: Number,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Image', imageSchema);
