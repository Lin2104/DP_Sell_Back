const { MailListener } = require('mail-listener5');
const cheerio = require('cheerio');

class PlatiEmailListener {
    constructor(options = {}) {
        this.email = options.email || process.env.PLATI_EMAIL;
        this.password = options.password || process.env.GMAIL_APP_PASSWORD;
        this.host = options.host || 'imap.gmail.com';
        this.port = options.port || 993;
        this.tls = options.tls !== false;
        
        this.mailListener = null;
        this.latestOTP = null;
        this.isListening = false;
        this.otpCallbacks = [];
    }

    async start() {
        if (this.isListening) return;

        this.mailListener = new MailListener({
            username: this.email,
            password: this.password,
            host: this.host,
            port: this.port,
            tls: this.tls,
            connTimeout: 10000,
            authTimeout: 5000,
            debug: console.log,
            autostop: false,
            mailbox: "INBOX",
            searchFilter: ["UNSEEN"],
            markSeen: true,
            fetchUnreadOnStart: true,
            attachments: false
        });

        this.mailListener.on("error", (err) => {
            console.error("Email Listener Error:", err);
        });

        this.mailListener.on("mail", (mail) => {
            this.processMail(mail);
        });

        this.mailListener.start();
        this.isListening = true;
        console.log(`PlatiEmailListener started for ${this.email}`);
    }

    processMail(mail) {
        const subject = mail.subject || "";
        const from = mail.from?.value?.[0]?.address || "";
        const html = mail.html || "";
        const text = mail.text || "";

        // Plati.market OTP email characteristics
        // Usually from: noreply@plati.market or similar
        // Subject often contains "Confirmation code" or "Login"
        if (subject.toLowerCase().includes("confirmation") || 
            subject.toLowerCase().includes("code") || 
            from.includes("plati.market")) {
            
            const otp = this.extractOTP(html || text);
            if (otp) {
                console.log(`Extracted Plati OTP: ${otp}`);
                this.latestOTP = otp;
                this.notifyCallbacks(otp);
            }
        }
    }

    extractOTP(content) {
        // Look for 6-digit code or specific patterns
        const $ = cheerio.load(content);
        const textContent = $.text();
        
        // Match 6 consecutive digits
        const match = textContent.match(/\b\d{6}\b/);
        return match ? match[0] : null;
    }

    waitForOTP(timeout = 60000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.otpCallbacks = this.otpCallbacks.filter(cb => cb !== callback);
                reject(new Error("OTP Timeout"));
            }, timeout);

            const callback = (otp) => {
                clearTimeout(timer);
                this.otpCallbacks = this.otpCallbacks.filter(cb => cb !== callback);
                resolve(otp);
            };

            this.otpCallbacks.push(callback);
        });
    }

    notifyCallbacks(otp) {
        while (this.otpCallbacks.length > 0) {
            const cb = this.otpCallbacks.shift();
            cb(otp);
        }
    }

    async stop() {
        if (this.mailListener) {
            this.mailListener.stop();
            this.isListening = false;
            console.log("PlatiEmailListener stopped");
        }
    }
}

module.exports = PlatiEmailListener;