const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs').promises;

class PlatiEmail {
    constructor(options = {}) {
        this.transporter = nodemailer.createTransport({
            service: options.emailService || 'gmail',
            auth: {
                user: options.emailUser || process.env.EMAIL_USER,
                pass: options.emailPass || process.env.EMAIL_PASS
            }
        });
        this.fromEmail = options.emailUser || process.env.EMAIL_USER || 'noreply@blasky.com';
    }

    async sendProductEmail(customerEmail, orderDetails, productDetails) {
        const pdfBuffer = await this.generateProductPDF(orderDetails, productDetails);

        const mailOptions = {
            from: this.fromEmail,
            to: customerEmail,
            subject: `Your Digital Product: ${productDetails.productName}`,
            text: this.buildEmailBody(orderDetails, productDetails),
            html: this.buildEmailHTML(orderDetails, productDetails),
            attachments: [
                {
                    filename: `${productDetails.productName.replace(/\s+/g, '_')}_Delivery.pdf`,
                    content: pdfBuffer
                }
            ]
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            return {
                success: true,
                messageId: result.messageId,
                accepted: result.accepted
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async generateProductPDF(orderDetails, productDetails) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 50
                });

                const buffers = [];
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
                doc.on('error', reject);

                doc.fontSize(24).fillColor('#2563eb').text('Digital Product Delivery', { align: 'center' });
                doc.moveDown();

                doc.fontSize(10).fillColor('#666').text(`Order ID: ${orderDetails.orderId}`, { align: 'right' });
                doc.fontSize(10).fillColor('#666').text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
                doc.moveDown(2);

                doc.fontSize(18).fillColor('#1f2937').text('Product Information');
                doc.moveDown(0.5);
                doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown();

                doc.fontSize(14).fillColor('#374151').text(`Product: ${productDetails.productName}`);
                doc.moveDown(0.3);

                if (productDetails.price) {
                    doc.fontSize(12).fillColor('#059669').text(`Price Paid: ${productDetails.price}`);
                    doc.moveDown(0.3);
                }

                if (productDetails.key) {
                    doc.fontSize(16).fillColor('#1f2937').text('Your Digital Key:', { underline: true });
                    doc.moveDown(0.3);
                    doc.fontSize(14).fillColor('#2563eb');
                    doc.text(productDetails.key, { align: 'center' });
                    doc.moveDown();
                }

                if (productDetails.accountInfo) {
                    doc.fontSize(14).fillColor('#1f2937').text('Account Information:', { underline: true });
                    doc.moveDown(0.3);
                    doc.fontSize(11).fillColor('#374151').text(productDetails.accountInfo);
                    doc.moveDown();
                }

                if (productDetails.description) {
                    doc.fontSize(14).fillColor('#1f2937').text('Product Description:', { underline: true });
                    doc.moveDown(0.3);
                    doc.fontSize(11).fillColor('#4b5563').text(productDetails.description);
                    doc.moveDown();
                }

                if (productDetails.downloadLinks && productDetails.downloadLinks.length > 0) {
                    doc.fontSize(14).fillColor('#1f2937').text('Download Links:', { underline: true });
                    doc.moveDown(0.3);
                    productDetails.downloadLinks.forEach(link => {
                        doc.fontSize(10).fillColor('#2563eb').text(`${link.name}: ${link.url}`);
                    });
                    doc.moveDown();
                }

                if (productDetails.additionalInfo && productDetails.additionalInfo.length > 0) {
                    doc.fontSize(14).fillColor('#1f2937').text('Additional Information:', { underline: true });
                    doc.moveDown(0.3);
                    doc.fontSize(10).fillColor('#4b5563');
                    productDetails.additionalInfo.forEach(info => {
                        doc.text(`• ${info}`);
                    });
                    doc.moveDown();
                }

                doc.moveDown(2);
                doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown();

                doc.fontSize(10).fillColor('#6b7280').text('Thank you for your purchase!', { align: 'center' });
                doc.moveDown(0.3);
                doc.fontSize(9).fillColor('#9ca3af').text('If you have any questions, please contact support.', { align: 'center' });
                doc.moveDown(0.3);
                doc.fontSize(9).fillColor('#9ca3af').text('Blasky Game Shop', { align: 'center' });

                doc.end();
            } catch (error) {
                reject(error);
            }
        });
    }

    buildEmailBody(orderDetails, productDetails) {
        let body = `Dear Customer,\n\n`;
        body += `Thank you for your purchase! Your digital product is ready.\n\n`;
        body += `Order ID: ${orderDetails.orderId}\n`;
        body += `Product: ${productDetails.productName}\n`;

        if (productDetails.key) {
            body += `\nYour Digital Key:\n${productDetails.key}\n`;
        }

        if (productDetails.accountInfo) {
            body += `\nAccount Information:\n${productDetails.accountInfo}\n`;
        }

        body += `\nPlease find the detailed guide in the attached PDF.\n`;
        body += `\nIf you have any questions, please contact our support team.\n\n`;
        body += `Best regards,\nBlasky Game Shop`;

        return body;
    }

    buildEmailHTML(orderDetails, productDetails) {
        return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
        .product-name { font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 15px; }
        .key-box { background: #eff6ff; border: 2px dashed #2563eb; padding: 15px; margin: 15px 0; border-radius: 8px; text-align: center; }
        .key { font-family: monospace; font-size: 16px; color: #2563eb; word-break: break-all; }
        .account-box { background: #f3f4f6; padding: 15px; margin: 15px 0; border-radius: 8px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Digital Product Delivered!</h1>
        </div>
        <div class="content">
            <p>Dear Customer,</p>
            <p>Thank you for your purchase! Your digital product is ready.</p>
            <p><strong>Order ID:</strong> ${orderDetails.orderId}</p>
            <p><strong>Product:</strong> ${productDetails.productName}</p>

            ${productDetails.key ? `
            <div class="key-box">
                <p style="margin: 0 0 10px 0; color: #1f2937;"><strong>Your Digital Key:</strong></p>
                <p class="key" style="margin: 0;">${productDetails.key}</p>
            </div>
            ` : ''}

            ${productDetails.accountInfo ? `
            <div class="account-box">
                <p style="margin-top: 0;"><strong>Account Information:</strong></p>
                <pre style="margin: 0; white-space: pre-wrap;">${productDetails.accountInfo}</pre>
            </div>
            ` : ''}

            ${productDetails.downloadLinks && productDetails.downloadLinks.length > 0 ? `
            <p><strong>Download Links:</strong></p>
            <ul>
                ${productDetails.downloadLinks.map(link => `<li><a href="${link.url}">${link.name}</a></li>`).join('')}
            </ul>
            ` : ''}

            <p>Please find the detailed setup guide in the attached PDF.</p>
            <p>If you have any questions, please contact our support team.</p>
        </div>
        <div class="footer">
            <p>Blasky Game Shop</p>
            <p>This email and attachments are confidential.</p>
        </div>
    </div>
</body>
</html>`;
    }

    async sendOrderConfirmation(customerEmail, orderDetails) {
        const mailOptions = {
            from: this.fromEmail,
            to: customerEmail,
            subject: `Order Confirmed: ${orderDetails.orderId}`,
            text: `Your order has been confirmed and is being processed. Order ID: ${orderDetails.orderId}`,
            html: `
                <h2>Order Confirmed!</h2>
                <p>Your order <strong>${orderDetails.orderId}</strong> has been confirmed.</p>
                <p>Product: ${orderDetails.productName}</p>
                <p>Amount: ${orderDetails.amount}</p>
                <p>Status: Being processed</p>
                <p>You will receive another email with your digital product once it's ready.</p>
            `
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async sendRefundNotification(customerEmail, orderDetails, reason) {
        const mailOptions = {
            from: this.fromEmail,
            to: customerEmail,
            subject: `Refund Processed: ${orderDetails.orderId}`,
            text: `Your refund has been processed. Order ID: ${orderDetails.orderId}. Reason: ${reason}`,
            html: `
                <h2>Refund Processed</h2>
                <p>Your order <strong>${orderDetails.orderId}</strong> has been refunded.</p>
                <p><strong>Reason:</strong> ${reason}</p>
                <p>The refund should appear in your account within 5-10 business days.</p>
                <p>If you have any questions, please contact support.</p>
            `
        };

        try {
            const result = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async verifyEmailConnection() {
        try {
            await this.transporter.verify();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = PlatiEmail;