const nodemailer = require('nodemailer');
const Order = require('../../models/Order');

class OrderEmailNotifications {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.PLATI_EMAIL, // Using existing email env
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
  }

  async sendOrderReceived(order) {
    const customerEmail = order.customerInfo?.email;
    if (!customerEmail) return;

    const mailOptions = {
      from: `"DP Sell Shop" <${process.env.PLATI_EMAIL}>`,
      to: customerEmail,
      subject: `Order Received - #${order._id}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #4f46e5;">Thank you for your order!</h2>
          <p>We've received your order for <strong>${order.gameType} - ${order.amount}</strong>.</p>
          <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order._id}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${order.amount}</p>
            <p style="margin: 5px 0;"><strong>Payment:</strong> ${order.paymentMethod}</p>
          </div>
          <p>You can track your order status here:</p>
          <a href="${process.env.FRONTEND_URL}/track/${order._id}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; font-weight: bold;">Track Order Status</a>
          <p style="color: #64748b; font-size: 12px; margin-top: 30px;">This is an automated message. Please do not reply.</p>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`[EmailNotify] Sent "Order Received" to ${customerEmail}`);
    } catch (err) {
      console.error('[EmailNotify] Failed to send order received email:', err.message);
    }
  }

  async sendPaymentConfirmed(order) {
    const customerEmail = order.customerInfo?.email;
    if (!customerEmail) return;

    const mailOptions = {
      from: `"DP Sell Shop" <${process.env.PLATI_EMAIL}>`,
      to: customerEmail,
      subject: `Payment Confirmed - #${order._id}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #10b981;">Payment Confirmed!</h2>
          <p>Your payment for order <strong>#${order._id}</strong> has been successfully verified.</p>
          <p>Our automated system is now processing your top-up/product. You will receive another email once it's completed.</p>
          <div style="margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/track/${order._id}" style="color: #4f46e5; text-decoration: underline;">Track live progress</a>
          </div>
        </div>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`[EmailNotify] Sent "Payment Confirmed" to ${customerEmail}`);
    } catch (err) {
      console.error('[EmailNotify] Failed to send payment confirmation email:', err.message);
    }
  }
}

module.exports = new OrderEmailNotifications();