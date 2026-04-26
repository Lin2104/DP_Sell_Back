const mongoose = require('mongoose');
require('dotenv').config();
const PaymentMethod = require('./models/PaymentMethod');

async function checkAndAddMMQR() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existing = await PaymentMethod.findOne({ name: 'MMQR' });
    if (existing) {
      existing.logo = '/MMQR_Logo.png';
      await existing.save();
      console.log('MMQR payment method updated with /MMQR_Logo.png');
    } else {
      const mmqr = new PaymentMethod({
        name: 'MMQR',
        accountName: 'MyanMyanPay',
        phoneNumber: 'Dynamic QR',
        logo: '/MMQR_Logo.png',
        isActive: true
      });
      await mmqr.save();
      console.log('MMQR payment method added successfully');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkAndAddMMQR();
