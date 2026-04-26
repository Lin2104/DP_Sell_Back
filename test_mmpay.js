const { MMPaySDK } = require('mmpay-node-sdk');
require('dotenv').config();

const MMPay = new MMPaySDK({
  appId: process.env.MMPAY_APP_ID,
  publishableKey: process.env.MMPAY_PUBLISHABLE_KEY,
  secretKey: process.env.MMPAY_SECRET_KEY,
  apiBaseUrl: process.env.MMPAY_API_BASE_URL
});

async function testMMPay() {
  try {
    console.log('Testing MMPay Sandbox QR creation...');
    const response = await MMPay.sandboxPay({
      orderId: 'test-order-' + Date.now(),
      amount: 1000,
      callbackUrl: process.env.MMPAY_CALLBACK_URL,
      items: [{ name: 'Test Product', amount: 1000, quantity: 1 }]
    });
    console.log('Response:', JSON.stringify(response, null, 2));
    if (response.qr || response.qrCode) {
      console.log('✅ Success! QR Code generated.');
    } else {
      console.log('❌ Failed to generate QR Code. Response:', response);
    }
  } catch (err) {
    console.error('❌ Error testing MMPay:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
  }
}

testMMPay();
