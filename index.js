require('dotenv').config();
const express = require('express');
const compression = require('compression');
const mongoose = require('mongoose');
const cors = require('cors');
const { Markup } = require('telegraf');
const Order = require('./models/Order');
const PaymentMethod = require('./models/PaymentMethod');
const Product = require('./models/Product');
const Category = require('./models/Category');
const Game = require('./models/Game');
const Review = require('./models/Review');
const User = require('./models/User');
const DigitalKey = require('./models/DigitalKey');
const ProductGuide = require('./models/ProductGuide');
const Promotion = require('./models/Promotion');
const Image = require('./models/Image');
const imageService = require('./services/imageService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { MMPaySDK } = require('mmpay-node-sdk');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const auditLogger = require('./middleware/auditLogger');
const bot = require('./bot');
const aiAgent = require('./ai/agent');
const { launchSupportBot } = require('./bot/supportBot');
const { PlatiService } = require('./services/plati');
const smileoneService = require('./services/smileoneService');
const { rebuildCatalogCache } = require('./services/catalogCache');

const PORT = process.env.PORT || 5000;
const API_BASE = process.env.API_BASE_PATH || '/api';

const app = express();

// CORS Configuration - MUST be first to handle preflight requests
const allowedOrigins = [
  'https://dp-sells-git-main-kos-projects-34ed6878.vercel.app',
  'https://dp-sells.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.includes(origin) || 
                     origin.endsWith('.vercel.app') || 
                     origin.includes('localhost') ||
                     origin.includes('127.0.0.1');
    
    if (isAllowed || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com", "blob:"],
      connectSrc: ["'self'", "https://api.cloudinary.com", "https://*.cloudinary.com", "https://*.vercel.app", "http://localhost:*"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Sanitization (Disabled for Express 5 compatibility)
// app.use(mongoSanitize());
// app.use(xss());

// Standard body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for Render deployment to handle X-Forwarded-For headers correctly
app.set('trust proxy', 1);

const platiService = new PlatiService();

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // 500 requests per 15 minutes
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // Skip preflight requests
});
app.use('/api/', globalLimiter);

// Stricter Rate Limiting for Auth and Orders
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 attempts per hour
  message: { error: 'Too many login/order attempts, please try again after an hour' },
  skip: (req) => req.method === 'OPTIONS', // Skip preflight requests
});
app.use('/api/auth/login', authLimiter);
app.use('/api/orders', authLimiter);

// Initialize MMPay
const MMPay = new MMPaySDK({
  appId: process.env.MMPAY_APP_ID,
  publishableKey: process.env.MMPAY_PUBLISHABLE_KEY,
  secretKey: process.env.MMPAY_SECRET_KEY,
  apiBaseUrl: process.env.MMPAY_API_BASE_URL || 'https://ezapi.myanmyanpay.com'
});

// Photo paths
const RECEIVE_PHOTO_PATH = path.join(__dirname, 'public/Receive_Photo.jpg');
const THANKS_PHOTO_PATH = path.join(__dirname, 'public/Thanks_Photo.jpg');
const CANCEL_PHOTO_PATH = path.join(__dirname, 'public/Cancel_Photo.jpg');

// Email Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.PLATI_EMAIL || process.env.EMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS
  }
});

// Helper: Generate PDF and Send Email
const sendDigitalKeyEmail = async (order, game, digitalKey, guide) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      let buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: order.customerInfo.email,
          subject: `Your Purchase: ${game.name} - Digital Key`,
          text: `Hello ${order.customerInfo.name || 'Customer'},\n\nThank you for your purchase! Your digital key and setup guide are attached as a PDF.\n\nYour Key: ${digitalKey.key}\n\nBest regards,\nBlasky Game Shop`,
          attachments: [
            {
              filename: `${game.name.replace(/\s+/g, '_')}_Key.pdf`,
              content: pdfBuffer
            }
          ]
        };

        await transporter.sendMail(mailOptions);
        resolve();
      });

      // Add content to PDF
      doc.fontSize(25).text('Digital Product Delivery', { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).text(`Product: ${game.name}`);
      doc.moveDown();
      doc.fontSize(14).text('Your Digital Key:', { underline: true });
      doc.fontSize(18).fillColor('blue').text(digitalKey.key);
      doc.fillColor('black').moveDown();
      
      if (guide) {
        doc.fontSize(14).text('Description:', { underline: true });
        doc.fontSize(12).text(guide.description);
        doc.moveDown();
        doc.fontSize(14).text('Setup Guide:', { underline: true });
        doc.fontSize(12).text(guide.setupGuide);
        if (guide.additionalInfo) {
          doc.moveDown();
          doc.fontSize(14).text('Additional Information:', { underline: true });
          doc.fontSize(12).text(guide.additionalInfo);
        }
      } else {
        // Fallback guide for Steam products if no specific guide exists
        if (game.name.toLowerCase().includes('steam') || (game.categoryId && game.categoryId.name && game.categoryId.name.toLowerCase().includes('steam'))) {
          doc.fontSize(16).text('Steam Offline Activation Guide (JambaStore)', { underline: true });
          doc.moveDown(0.5);
          doc.fontSize(10).text('This is a Steam Offline Activation product. Please follow these steps carefully:');
          doc.moveDown();
          
          doc.fontSize(12).text('1. LOGIN: Open Steam and login with the provided Username & Password.');
          doc.moveDown(0.3);
          doc.fontSize(12).text('2. DOWNLOAD: Find the game in Library and download it 100%.');
          doc.moveDown(0.3);
          doc.fontSize(12).text('3. ACTIVATE: Launch the game once while ONLINE to reach the main menu.');
          doc.moveDown(0.3);
          doc.fontSize(12).text('4. DISABLE CLOUD: In game Properties -> General, disable "Steam Cloud".');
          doc.moveDown(0.3);
          doc.fontSize(12).text('5. OFFLINE MODE: Click "Steam" (top left) -> "Go Offline..." -> Restart.');
          doc.moveDown();
          
          doc.fontSize(12).fillColor('red').text('CRITICAL RULES:', { bold: true });
          doc.fontSize(10).text('- DO NOT change account password or email.');
          doc.text('- DO NOT enable Steam Guard or Mobile Authenticator.');
          doc.text('- ALWAYS play in Offline Mode.');
          doc.fillColor('black');
        } else {
          doc.fontSize(12).text('Please use the key above to activate your product.');
        }
      }
      
      doc.moveDown(2);
      doc.fontSize(10).text('Thank you for choosing Blasky Game Shop!', { align: 'center', color: 'gray' });
      
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Database connection will fail.');
} else {
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ Connected to MongoDB');
      
      // Build catalog cache on startup
      try {
        await rebuildCatalogCache();
      } catch (cacheErr) {
        console.error('Failed to build catalog cache on startup:', cacheErr);
      }
      
      // Bot launching with safety check
      if (process.env.TELEGRAM_BOT_TOKEN && process.env.DISABLE_MAIN_BOT !== 'true') {
        const launchMainBot = async (retryCount = 0) => {
          try {
            console.log(`[MainBot] Launching... (Attempt ${retryCount + 1})`);
            // Stop existing instance with timeout
            try { 
              const stopPromise = bot.stop();
              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Stop timeout')), 5000));
              await Promise.race([stopPromise, timeoutPromise]);
            } catch (e) {
              console.log('[MainBot] Stop attempt info:', e.message);
            }

            await bot.launch({
              allowedUpdates: ['message', 'callback_query', 'pre_checkout_query', 'successful_payment'],
              dropPendingUpdates: true
            });
            console.log('✅ Telegram Bot is running');
          } catch (err) {
            if ((err.message.includes('409: Conflict') || err.message.includes('timeout')) && retryCount < 5) {
              const delay = Math.pow(2, retryCount) * 5000;
              console.log(`[MainBot] Startup issue: ${err.message}. Retrying in ${delay/1000}s...`);
              setTimeout(() => launchMainBot(retryCount + 1), delay);
            } else {
              console.error('Telegram Bot failed to start:', err);
            }
          }
        };

        launchMainBot();

        // Global error handler for main bot
        bot.catch((err, ctx) => {
          console.error(`[MainBot Error] ${ctx.update_type}:`, err);
        });
        
        bot.use(async (ctx, next) => {
          try {
            await next();
          } catch (err) {
            console.error('Bot error:', err);
          }
        });
      }

      if (process.env.SUPPORT_BOT_TOKEN && process.env.DISABLE_SUPPORT_BOT !== 'true') {
        launchSupportBot();
      }

      if (process.env.PLATI_EMAIL && process.env.GMAIL_APP_PASSWORD) {
        try {
          await platiService.initialize();
          console.log('✅ PlatiService initialized');
        } catch (err) {
          console.error('PlatiService initialization failed:', err.message);
        }
      }

      try {
        await smileoneService.initialize();
        console.log('✅ SmileOneService initialized');

        const sessionManager = require('./services/smileone/sessionManager');
        sessionManager.setBot(bot);
        sessionManager.startMonitoring(30);
        console.log('✅ SmileOne session monitoring started');

        const stockMonitor = require('./services/plati/stockMonitor');
        stockMonitor.setBot(bot);
        stockMonitor.startMonitoring(10);
        console.log('✅ Plati stock monitoring started');
      } catch (err) {
        console.error('Service initialization failed:', err.message);
      }
    })
    .catch(err => console.error('❌ MongoDB connection error:', err));
}

// Middleware
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(compression());

// Image Retrieval Endpoint
app.get(`${API_BASE}/images/:id`, async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) return res.status(404).send('Image not found');
    
    const imgBuffer = Buffer.from(image.data, 'base64');
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(imgBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Health Check & Root
app.get('/health', (req, res) => res.status(200).send('OK'));

// Keep-alive endpoint to prevent Render spin-down
app.get('/keep-alive', (req, res) => {
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: bot ? 'initialized' : 'not initialized'
  });
});

// Cron-style keep-alive that auto-wakes Render every 14 minutes (it spins down after 15 min idle)
// Only run if API_BASE_URL is configured (otherwise skip self-ping)
if (process.env.API_BASE_URL) {
  const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000;
  setInterval(async () => {
    try {
      const response = await fetch(`${process.env.API_BASE_URL}/keep-alive`);
      if (response.ok) {
        console.log(`[Keep-alive] Self-ping sent at ${new Date().toISOString()}`);
      }
    } catch (err) {
      console.log('[Keep-alive] Could not ping self (may be spinning up)');
    }
  }, KEEP_ALIVE_INTERVAL);
  console.log('✅ Keep-alive self-ping scheduled (every 14 min)');
} else {
  console.log('⚠️ API_BASE_URL not set - skipping self-ping (use external monitor instead)');
}

app.get('/', (req, res) => {
  res.json({ 
    message: 'Blasky Game Shop API is running! 🚀',
    version: '1.0.0',
    status: 'healthy'
  });
});

// API Root route
app.get(API_BASE, (req, res) => {
  res.json({
    message: 'Welcome to the Blasky Game Shop API',
    endpoints: {
      games: `${API_BASE}/games`,
      categories: `${API_BASE}/categories`,
      promotions: `${API_BASE}/promotions`
    }
  });
});

// Routes

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error();
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Please authenticate' });
  }
};

// Payment Method Management
app.get(`${API_BASE}/payment-methods`, async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const methods = await PaymentMethod.find(filter);
    res.json(methods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auth Routes
app.post(`${API_BASE}/auth/signup`, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Please provide all fields' });
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });
    const user = new User({ name, email, password });
    await user.save();
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/auth/login`, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) return res.status(400).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/auth/forgot-password`, async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`[Auth] Password reset requested for: ${email}`);
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[Auth] User not found: ${email}`);
      return res.status(404).json({ error: 'User not found' });
    }

    const crypto = require('crypto');
    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;
    
    console.log(`[Auth] Sending reset email to: ${user.email}`);
    await transporter.sendMail({
      from: process.env.PLATI_EMAIL || process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Reset Request',
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
            `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
            `${resetUrl}\n\n` +
            `If you did not request this, please ignore this email and your password will remain unchanged.\n`
    });

    console.log(`[Auth] Reset email sent successfully to: ${user.email}`);
    res.json({ message: 'Reset email sent' });
  } catch (err) {
    console.error(`[Auth] Error in forgot-password:`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/auth/reset-password/:token`, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ error: 'Password reset token is invalid or has expired' });

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password has been reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/auth/google`, async (req, res) => {
  try {
    const { token } = req.body;
    // In a real app, you would verify this token with Google's library
    // const ticket = await client.verifyIdToken({ idToken: token, audience: CLIENT_ID });
    // const payload = ticket.getPayload();
    
    // For now, let's assume the frontend sends user info after verification
    const { email, name, googleId, avatar } = req.body;
    
    let user = await User.findOne({ $or: [{ googleId }, { email }] });
    
    if (user) {
      if (!user.googleId) user.googleId = googleId;
      if (avatar) user.avatar = avatar;
      await user.save();
    } else {
      user = new User({
        name,
        email,
        googleId,
        avatar,
        password: crypto.randomBytes(16).toString('hex') // Random password for social login
      });
      await user.save();
    }

    const jwtToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret', { expiresIn: '7d' });
    res.json({ token: jwtToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Category Management
app.get(`${API_BASE}/categories`, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Game/Service Management
app.get(`${API_BASE}/games`, async (req, res) => {
  try {
    const projection = { description: 0, benefits: 0, purchaseInfo: 0, systemRequirements: 0 };
    // projection already excludes heavy fields like description, benefits, etc.
    // We only exclude icon if specifically requested via excludeIcon
    if (req.query.excludeIcon === 'true') {
      projection.icon = 0;
    }
    const games = await Game.find({}, projection).populate('categoryId', 'name type').sort({ name: 1 });
    
    // Skip expensive price aggregation if requested (common in Admin Panel)
    if (req.query.skipPrice === 'true') {
      return res.json(games);
    }

    // Efficiently get starting price for each game using aggregation
    // Only perform this if we have games to price and skipPrice isn't true
    let priceMap = {};
    if (req.query.skipPrice !== 'true' && games.length > 0) {
      const prices = await Product.aggregate([
        { $match: { isActive: true } },
        { $sort: { price: 1 } },
        { $group: {
            _id: "$gameId",
            minPrice: { $first: "$price" }
        }}
      ]).allowDiskUse(true); // Allow disk use for larger datasets

      prices.forEach(p => {
        if (p._id) priceMap[p._id.toString()] = p.minPrice;
      });
    }
    
    const gamesWithPrice = games.map(game => ({
      ...game.toObject(),
      minPrice: priceMap[game._id.toString()] || null
    }));
    
    res.json(gamesWithPrice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/games/:id`, async (req, res) => {
  try {
    const game = await Game.findById(req.params.id).populate('categoryId');
    if (!game) return res.status(404).json({ error: 'Game not found' });
    
    // Always return all products for the game, but filter payment methods if not admin
    const pmFilter = req.query.all === 'true' ? {} : { isActive: true };
    const [products, paymentMethods, reviews] = await Promise.all([
      Product.find({ gameId: game._id }),
      PaymentMethod.find(pmFilter).sort({ name: 1 }),
      Review.find({ gameId: game._id }).sort({ createdAt: -1 })
    ]);
    res.json({ game, products, paymentMethods, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Order Management
app.post(`${API_BASE}/orders`, async (req, res) => {
  try {
    const { gameType, gameId, productId, zoneId, amount, customerInfo, paymentMethod, transactionId, transactionScreenshot } = req.body;
    
    let processedScreenshot = transactionScreenshot;
    if (transactionScreenshot && transactionScreenshot.startsWith('data:image/')) {
      const imageId = await imageService.saveImage(transactionScreenshot);
      if (imageId) {
        processedScreenshot = imageService.getImageUrl(imageId);
      }
    }

    const order = new Order({ gameType, gameId, productId, zoneId, amount, customerInfo, paymentMethod, transactionId, transactionScreenshot: processedScreenshot });
    
    // Skip telegram notification for MMQR until paid
    if (paymentMethod && paymentMethod.toUpperCase() === 'MMQR') {
      order.paymentStatus = 'awaiting_payment';
      order.orderStatus = 'awaiting_payment';
      await order.save();
      console.log(`MMQR Order ${order._id} saved. Awaiting payment...`);
      return res.status(201).json({ message: 'Order created, awaiting payment', orderId: order._id });
    }

    await order.save();
    
    // Send Order Received Email
    const orderEmailNotifications = require('./services/notifications/orderEmailNotifications');
    await orderEmailNotifications.sendOrderReceived(order);
    
    // Notify Admin via Telegram (for other methods)
    if (process.env.ADMIN_CHAT_ID) {
      const game = await Game.findById(order.gameId);
      const caption = `📦 New Order (${order.gameType})!\n\n` +
        `Game: ${game ? game.name : 'N/A'}\n` +
        `User Game ID: ${order.transactionId || 'N/A'}\n` + // Use transactionId for user's Game ID
        (order.zoneId ? `Zone ID: ${order.zoneId}\n` : '') +
        (order.customerInfo?.email ? `Customer Email: ${order.customerInfo.email}\n` : '') +
        `Amount: ${order.amount}\n` +
        `Payment: ${order.paymentMethod}\n` +
        `Order ID: ${order._id}\n`;
      
      const buttons = Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Approve (Auto)', `approve_${order._id}`)],
        [Markup.button.callback('✅ Finish (Manual)', `finish_${order._id}`)],
        [Markup.button.callback('❌ Reject Order', `cancel_${order._id}`)]
      ]);

      if (order.transactionScreenshot) {
        let screenshotData = order.transactionScreenshot;
        
        // If it's a URL reference, fetch the data from our Image collection
        const imageId = imageService.extractIdFromUrl(order.transactionScreenshot);
        if (imageId) {
          const image = await Image.findById(imageId);
          if (image) {
            screenshotData = `data:${image.contentType};base64,${image.data}`;
          }
        }

        if (screenshotData.startsWith('data:image/')) {
          const base64Part = screenshotData.split(',')[1];
          await bot.telegram.sendPhoto(process.env.ADMIN_CHAT_ID, { source: Buffer.from(base64Part, 'base64') }, {
            caption: caption,
            parse_mode: 'HTML',
            ...buttons
          });
        } else {
          await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, caption, { parse_mode: 'HTML', ...buttons });
        }
      } else {
        await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, caption, { parse_mode: 'HTML', ...buttons });
      }
    }
    res.status(201).json({ message: 'Order created successfully', orderId: order._id });
  } catch (err) {
    console.error('Error creating order:', err); // Add detailed error logging
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/orders/:id/status`, async (req, res) => {
  try {
    console.log('--- STATUS POLLING RECEIVED FOR:', req.params.id, '---');
    const order = await Order.findById(req.params.id).select('paymentStatus orderStatus');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ paymentStatus: order.paymentStatus, orderStatus: order.orderStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/orders/user`, auth, async (req, res) => {
  try {
    const orders = await Order.find({ 'customerInfo.userId': req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Order Management
app.get(`${API_BASE}/orders`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    // Exclude large screenshot data from the list view to prevent timeouts
    const orders = await Order.find()
      .select('-transactionScreenshot -paymentScreenshot')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/orders/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch(`${API_BASE}/orders/:id/status`, auth, auditLogger('update_status', 'order'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { orderStatus, paymentStatus, isAuto, rejectionReason } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const prevStatus = order.orderStatus;
    const prevPaymentStatus = order.paymentStatus;
    order.orderStatus = orderStatus || order.orderStatus;
    order.paymentStatus = paymentStatus || order.paymentStatus;
    if (rejectionReason) order.rejectionReason = rejectionReason;
    await order.save();

    // Send Payment Confirmed Email
    if (order.paymentStatus === 'paid' && prevPaymentStatus !== 'paid') {
      const orderEmailNotifications = require('./services/notifications/orderEmailNotifications');
      await orderEmailNotifications.sendPaymentConfirmed(order);
    }

    // TRIGGER AUTOMATION: Only when order is approved/processing (not completed yet)
    // and it's from the web admin panel approval action with isAuto=true
    if (order.orderStatus === 'processing' && prevStatus !== 'processing' && isAuto) {
      const game = await Game.findById(order.gameId);
      // Check if this game is a SmileOne supported game (e.g., Mobile Legends, PUBG)
      const gameName = (game?.name || '').toLowerCase();
      if (gameName.includes('mobile legend') || gameName.includes('pubg')) {
        try {
          await smileoneService.addPurchaseJob(order);
          console.log(`SmileOne purchase triggered for order ${order._id}`);
        } catch (err) {
          console.error('Failed to trigger SmileOne automation:', err);
        }
      }
    }

    // If order is completed and it's a digital product, assign key and send email
    if (order.orderStatus === 'completed' && prevStatus !== 'completed') {
      // 1. Send Thanks_Photo to customer if they are from Telegram
      if (order.customerInfo && order.customerInfo.telegramId) {
        try {
          if (fs.existsSync(THANKS_PHOTO_PATH)) {
            await bot.telegram.sendPhoto(order.customerInfo.telegramId, { source: fs.readFileSync(THANKS_PHOTO_PATH) }, {
              caption: `✨ Your order ${order._id} has been completed! Thank you for shopping with us.`
            });
          } else {
            await bot.telegram.sendMessage(order.customerInfo.telegramId, `✨ Your order ${order._id} has been completed! Thank you for shopping with us.`);
          }
        } catch (tgErr) {
          console.error('Failed to send Telegram completion notification:', tgErr);
        }
      }

      // 2. Handle Digital Product Key Assignment
      if (order.gameId) {
        const game = await Game.findById(order.gameId);
        if (game) {
          // Find an unused key for this game
          const digitalKey = await DigitalKey.findOne({ gameId: order.gameId, isUsed: false });
          if (digitalKey) {
            digitalKey.isUsed = true;
            digitalKey.orderId = order._id;
            await digitalKey.save();

            // Find product guide
            const guide = await ProductGuide.findOne({ gameId: order.gameId });

            // Send email with PDF (if customer email is provided)
            if (order.customerInfo && order.customerInfo.email) {
              try {
                await sendDigitalKeyEmail(order, game, digitalKey, guide);
                console.log(`Digital key email sent for order ${order._id}`);
              } catch (emailErr) {
                console.error('Failed to send digital key email:', emailErr);
              }
            }
          } else {
            console.warn(`No unused keys found for game ${order.gameId} (Order ${order._id})`);
          }
        }

        if (game && game.platiUrls && game.platiUrls.length > 0) {
          const platiUrls = game.platiUrls;
          const buyerEmail = process.env.PLATI_EMAIL || 'buyer@example.com';
          const customerEmail = order.customerInfo?.email;

          if (customerEmail) {
            try {
              const result = await platiService.purchaseWithFirstAvailableUrl(
                order._id.toString(),
                platiUrls,
                buyerEmail,
                customerEmail,
                order.amount
              );
              order.platiOrderId = result.jobId;
              order.platiUrl = platiUrls[0];
              await order.save();
              console.log(`Plati purchase initiated for order ${order._id}, job: ${result.jobId}`);
            } catch (platiErr) {
              console.error('Plati automation error:', platiErr);
            }
          }
        }
      }
    }

    // Handle Order Rejection Notification
    if (order.orderStatus === 'rejected' && prevStatus !== 'rejected') {
      if (order.customerInfo && order.customerInfo.telegramId) {
        try {
          const reasonText = order.rejectionReason ? `\nReason: ${order.rejectionReason}` : '';
          const message = `❌ Your order ${order._id} has been rejected.${reasonText}\nIf you have any questions, please contact support.`;
          
          if (fs.existsSync(CANCEL_PHOTO_PATH)) {
            await bot.telegram.sendPhoto(order.customerInfo.telegramId, { source: fs.readFileSync(CANCEL_PHOTO_PATH) }, {
              caption: message
            });
          } else {
            await bot.telegram.sendMessage(order.customerInfo.telegramId, message);
          }
        } catch (tgErr) {
          console.error('Failed to send Telegram rejection notification:', tgErr);
        }
      }
    }

    const populatedOrder = await Order.findById(order._id).populate('gameId');
    res.json(populatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/orders/:id/demo`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    res.json({ message: 'Demo test started successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Product Management
app.get(`${API_BASE}/products`, async (req, res) => {
  try {
    const projection = req.query.excludeIcon === 'true' ? { icon: 0 } : {};
    // Ensure icon is NOT excluded if excludeIcon is not true
    const products = await Product.find({}, projection).populate('gameId', 'name');
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/products/:id`, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('gameId', 'name');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/products`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process icon if it's a Base64 string
    if (req.body.icon && req.body.icon.startsWith('data:image/')) {
      const imageId = await imageService.saveImage(req.body.icon);
      if (imageId) {
        req.body.icon = imageService.getImageUrl(imageId);
      }
    }

    const product = new Product(req.body);
    await product.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/products/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process icon if it's a Base64 string
    if (req.body.icon && req.body.icon.startsWith('data:image/')) {
      const oldProduct = await Product.findById(req.params.id);
      const oldImageId = oldProduct ? imageService.extractIdFromUrl(oldProduct.icon) : null;
      
      const imageId = await imageService.saveImage(req.body.icon, oldImageId);
      if (imageId) {
        req.body.icon = imageService.getImageUrl(imageId);
      }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/products/:id/plati-urls`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls array is required' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.platiUrls = product.platiUrls || [];
    urls.forEach(url => {
      if (!product.platiUrls.includes(url)) {
        product.platiUrls.push(url);
      }
    });
    await product.save();
    res.json({ message: 'Plati URLs added', platiUrls: product.platiUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/products/:id/plati-urls`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { url } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    if (url) {
      product.platiUrls = (product.platiUrls || []).filter(u => u !== url);
    } else {
      product.platiUrls = [];
    }
    await product.save();
    res.json({ message: 'Plati URL removed', platiUrls: product.platiUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/products/:id/plati-urls`, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('platiUrls');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ platiUrls: product.platiUrls || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Category Management
app.post(`${API_BASE}/categories`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const category = new Category(req.body);
    await category.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/categories/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Game Management
app.post(`${API_BASE}/games`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process icon if it's a Base64 string
    if (req.body.icon && req.body.icon.startsWith('data:image/')) {
      const imageId = await imageService.saveImage(req.body.icon);
      if (imageId) {
        req.body.icon = imageService.getImageUrl(imageId);
      }
    }

    const game = new Game(req.body);
    await game.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/games/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process icon if it's a Base64 string
    if (req.body.icon && req.body.icon.startsWith('data:image/')) {
      const oldGame = await Game.findById(req.params.id);
      const oldImageId = oldGame ? imageService.extractIdFromUrl(oldGame.icon) : null;
      
      const imageId = await imageService.saveImage(req.body.icon, oldImageId);
      if (imageId) {
        req.body.icon = imageService.getImageUrl(imageId);
      }
    }

    const game = await Game.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Payment Method Management
app.post(`${API_BASE}/payment-methods`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process logo if it's a Base64 string
    if (req.body.logo && req.body.logo.startsWith('data:image/')) {
      const imageId = await imageService.saveImage(req.body.logo);
      if (imageId) {
        req.body.logo = imageService.getImageUrl(imageId);
      }
    }

    const pm = new PaymentMethod(req.body);
    await pm.save();
    res.status(201).json(pm);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/payment-methods/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process logo if it's a Base64 string
    if (req.body.logo && req.body.logo.startsWith('data:image/')) {
      const oldPm = await PaymentMethod.findById(req.params.id);
      const oldImageId = oldPm ? imageService.extractIdFromUrl(oldPm.logo) : null;
      
      const imageId = await imageService.saveImage(req.body.logo, oldImageId);
      if (imageId) {
        req.body.logo = imageService.getImageUrl(imageId);
      }
    }

    const pm = await PaymentMethod.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json(pm);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Review Management
app.get(`${API_BASE}/admin/reviews`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const reviews = await Review.find().sort({ createdAt: -1 }).populate('gameId', 'name');
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Digital Keys Management
app.get(`${API_BASE}/admin/digital-keys`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const keys = await DigitalKey.find().populate('gameId', 'name').sort({ createdAt: -1 });
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/admin/digital-keys`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { gameId, key } = req.body;
    // Support multiple keys at once (comma or newline separated)
    const keyArray = key.split(/[\n,]+/).map(k => k.trim()).filter(k => k);
    const keys = await DigitalKey.insertMany(keyArray.map(k => ({ gameId, key: k })));
    res.status(201).json(keys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/admin/digital-keys/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    await DigitalKey.findByIdAndDelete(req.params.id);
    res.json({ message: 'Key deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Plati URLs Management
app.post(`${API_BASE}/admin/plati-urls`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { gameId, urls } = req.body;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    game.platiUrls = game.platiUrls || [];
    urls.forEach(url => {
      if (!game.platiUrls.includes(url)) {
        game.platiUrls.push(url);
      }
    });
    await game.save();
    res.json({ message: 'Plati URLs added', platiUrls: game.platiUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/admin/plati-urls`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { gameId, urls } = req.body;

    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    game.platiUrls = urls;
    await game.save();
    res.json({ message: 'Plati URLs updated', platiUrls: game.platiUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/admin/plati-urls`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { gameId } = req.body;

    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    game.platiUrls = [];
    await game.save();
    res.json({ message: 'Plati automation removed', platiUrls: game.platiUrls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Product Guides Management
app.get(`${API_BASE}/admin/product-guides`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const guides = await ProductGuide.find().populate('gameId', 'name');
    res.json(guides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/admin/product-guides`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { gameId, description, setupGuide, additionalInfo } = req.body;
    const guide = await ProductGuide.findOneAndUpdate(
      { gameId },
      { description, setupGuide, additionalInfo, updatedAt: Date.now() },
      { upsert: true, returnDocument: 'after' }
    );
    res.status(201).json(guide);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Promotions Management
app.get(`${API_BASE}/promotions`, async (req, res) => {
  try {
    const filter = req.query.all === 'true' ? {} : { isActive: true };
    const promotions = await Promotion.find(filter).sort({ createdAt: -1 });
    res.json(promotions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/admin/promotions`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process image if it's a Base64 string
    if (req.body.image && req.body.image.startsWith('data:image/')) {
      const imageId = await imageService.saveImage(req.body.image);
      if (imageId) {
        req.body.image = imageService.getImageUrl(imageId);
      }
    }

    const promotion = new Promotion(req.body);
    await promotion.save();
    res.status(201).json(promotion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/admin/promotions/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    // Process image if it's a Base64 string
    if (req.body.image && req.body.image.startsWith('data:image/')) {
      const oldPromotion = await Promotion.findById(req.params.id);
      const oldImageId = oldPromotion ? imageService.extractIdFromUrl(oldPromotion.image) : null;
      
      const imageId = await imageService.saveImage(req.body.image, oldImageId);
      if (imageId) {
        req.body.image = imageService.getImageUrl(imageId);
      }
    }

    const promotion = await Promotion.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json(promotion);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/admin/promotions/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    const promotion = await Promotion.findById(req.params.id);
    if (promotion) {
      const imageId = imageService.extractIdFromUrl(promotion.image);
      if (imageId) await imageService.deleteImage(imageId);
    }

    await Promotion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Promotion deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Agent Control (Admin Only)
let currentAiAgent = null;

app.post(`${API_BASE}/ai/start`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: 'API Key is required' });

    // Stop existing if any
    if (currentAiAgent) {
      currentAiAgent.isRunning = false;
    }

    const OpenRouterAgent = require('./ai/agent');
    currentAiAgent = new OpenRouterAgent(apiKey);
    currentAiAgent.isRunning = true;
    currentAiAgent.logs.push('AI Agent started successfully.');
    
    // Start the agent loop in background
    // (Actual loop implementation would be inside agent.js or here)
    
    res.json({ logs: currentAiAgent.logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/ai/stop`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    if (currentAiAgent) {
      currentAiAgent.isRunning = false;
      currentAiAgent.logs.push('AI Agent stopped.');
    }
    res.json({ message: 'AI Agent stopped' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/ai/status`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    res.json({
      isRunning: currentAiAgent ? currentAiAgent.isRunning : false,
      logs: currentAiAgent ? currentAiAgent.logs : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin User Management
app.get(`${API_BASE}/admin/users`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { role } = req.query;
    const filter = role ? { role } : {};
    const users = await User.find(filter).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/admin/users`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { name, email, password, role } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already exists' });
    const user = new User({ name, email, password, role });
    await user.save();
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put(`${API_BASE}/admin/users/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { name, email, password, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (password) user.password = password; // Middleware will hash it
    
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/admin/users/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MMPay Integration
app.post(`${API_BASE}/payments/mmpay/create-qr`, async (req, res) => {
  try {
    const { orderId, amount, items } = req.body;
    const isSandbox = process.env.MMPAY_PUBLISHABLE_KEY?.startsWith('pk_test_');
    const params = { orderId, amount, callbackUrl: process.env.MMPAY_CALLBACK_URL, items };
    
    let response = isSandbox ? await MMPay.sandboxPay(params) : await MMPay.pay(params);

    if (response && response.message && (response.name === 'Error' || response.code)) {
      return res.status(500).json({ error: `MMPay SDK Error: ${response.message}` });
    }
    if (response && response.qr && !response.qrCode) response.qrCode = response.qr;
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/webhooks/mmpay`, async (req, res) => {
  try {
    const incomingSignature = req.headers['x-mmpay-signature'];
    const incomingNonce = req.headers['x-mmpay-nonce'];
    const payload = req.body;
    const payloadString = JSON.stringify(payload);
    const isValid = await MMPay.verifyCb(payloadString, incomingNonce, incomingSignature);
    
    if (!isValid) return res.status(401).json({ error: 'Invalid signature' });

    const { orderId, status, transactionRefId } = payload;
    if (status?.toUpperCase() === 'SUCCESS') {
      const order = await Order.findById(orderId);
      if (order) {
        order.paymentStatus = 'paid';
        order.orderStatus = 'processing';
        order.transactionId = transactionRefId;
        await order.save();
        
        if (process.env.ADMIN_CHAT_ID) {
          const caption = `💰 MMQR Payment Received!\n\nOrder ID: ${order._id}\nAmount: ${order.amount}`;
          await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, caption);
        }
      }
    }
    res.json({ message: 'Webhook processed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_BASE}/webhooks/binance`, async (req, res) => {
  try {
    const callbackData = req.body;
    const result = await platiService.handlePaymentCallback(callbackData);

    if (result.success && result.purchaseDetails) {
      const order = await Order.findById(result.orderId);
      if (order) {
        order.orderStatus = 'completed';
        order.platiOrderId = result.purchaseDetails.orderId;
        await order.save();

        if (process.env.ADMIN_CHAT_ID) {
          await bot.telegram.sendMessage(
            process.env.ADMIN_CHAT_ID,
            `✅ Plati Purchase Completed!\n\nOrder ID: ${order._id}\nProduct delivered to customer.`
          );
        }
      }
    }

    res.json({ message: 'Binance webhook processed', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simulation route
app.post(`${API_BASE}/payments/mmpay/simulate-success`, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!process.env.MMPAY_PUBLISHABLE_KEY?.startsWith('pk_test_')) {
      return res.status(403).json({ error: 'Simulation only allowed in sandbox' });
    }
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.paymentStatus = 'paid';
    order.orderStatus = 'processing';
    order.transactionId = 'SIMULATED-' + Date.now();
    await order.save();

    if (process.env.ADMIN_CHAT_ID) {
      await bot.telegram.sendMessage(process.env.ADMIN_CHAT_ID, `🧪 [SANDBOX] Payment Received!\nOrder ID: ${order._id}`);
    }
    res.json({ message: 'Simulation successful' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review Management
app.post(`${API_BASE}/reviews`, async (req, res) => {
  try {
    const review = new Review(req.body);
    await review.save();
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_BASE}/reviews/:gameId`, async (req, res) => {
  try {
    const reviews = await Review.find({ gameId: req.params.gameId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Review Management
app.delete(`${API_BASE}/admin/reviews/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generic Delete Routes for Admin
app.delete(`${API_BASE}/games/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    const game = await Game.findById(req.params.id);
    if (game) {
      // Delete game icon
      const imageId = imageService.extractIdFromUrl(game.icon);
      if (imageId) await imageService.deleteImage(imageId);
      
      // Delete icons for all associated products
      const products = await Product.find({ gameId: req.params.id });
      for (const product of products) {
        const pImageId = imageService.extractIdFromUrl(product.icon);
        if (pImageId) await imageService.deleteImage(pImageId);
      }
    }

    await Game.findByIdAndDelete(req.params.id);
    // Also delete associated products
    await Product.deleteMany({ gameId: req.params.id });
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json({ message: 'Game and associated products deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/products/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    const product = await Product.findById(req.params.id);
    if (product) {
      const imageId = imageService.extractIdFromUrl(product.icon);
      if (imageId) await imageService.deleteImage(imageId);
    }

    await Product.findByIdAndDelete(req.params.id);
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/categories/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    await Category.findByIdAndDelete(req.params.id);
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err));
    res.json({ message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_BASE}/payment-methods/:id`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    
    const pm = await PaymentMethod.findById(req.params.id);
    if (pm) {
      const imageId = imageService.extractIdFromUrl(pm.logo);
      if (imageId) await imageService.deleteImage(imageId);
    }

    await PaymentMethod.findByIdAndDelete(req.params.id);
    res.json({ message: 'Payment method deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Order Tracking (Public - no auth required)
app.get(`${API_BASE}/track/:orderId`, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('gameId', 'name icon');
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const statusSteps = [
      { id: 1, label: 'Order Received', completed: true, active: false },
      { id: 2, label: 'Payment Verified', completed: false, active: false },
      { id: 3, label: 'Processing', completed: false, active: false },
      { id: 4, label: 'Completed', completed: false, active: false }
    ];

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'awaiting_payment') {
      statusSteps[1].completed = true;
      statusSteps[1].active = order.paymentStatus === 'awaiting_payment';
    }
    if (order.orderStatus === 'processing') statusSteps[2].active = true;
    if (order.orderStatus === 'completed') {
      statusSteps[1].completed = true;
      statusSteps[2].completed = true;
      statusSteps[3].completed = true;
      statusSteps[3].active = true;
    }

    res.json({
      orderId: order._id,
      gameName: order.gameId?.name || order.gameType,
      amount: order.amount,
      paymentMethod: order.paymentMethod,
      status: order.orderStatus,
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      zoneId: order.zoneId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusSteps,
      isCompleted: order.orderStatus === 'completed',
      isRejected: order.orderStatus === 'rejected'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order status' });
  }
});

// Automation Dashboard (Admin Only)
app.get(`${API_BASE}/admin/automation-stats`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const automationDashboard = require('./services/automationDashboard');
    const stats = await automationDashboard.getAllStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry Failed Order (Admin Only)
app.post(`${API_BASE}/admin/retry-order/:orderId`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const retryHandler = require('./services/retryHandler');
    const result = await retryHandler.retryOrder(req.params.orderId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Failed Orders (Admin Only)
app.get(`${API_BASE}/admin/failed-orders`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const retryHandler = require('./services/retryHandler');
    const failedOrders = await retryHandler.getFailedOrders();
    res.json(failedOrders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk Approve Orders (Admin Only)
app.post(`${API_BASE}/admin/orders/bulk-approve`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { orderIds, isAuto } = req.body;
    
    const results = [];
    for (const id of orderIds) {
      // Simulate status patch for each
      const order = await Order.findById(id);
      if (order && (order.orderStatus === 'pending' || order.orderStatus === 'awaiting_payment')) {
        order.orderStatus = 'processing';
        order.paymentStatus = 'paid';
        await order.save();
        
        if (isAuto) {
          const game = await Game.findById(order.gameId);
          const gameName = (game?.name || '').toLowerCase();
          if (gameName.includes('mobile legend') || gameName.includes('pubg')) {
            await smileoneService.addPurchaseJob(order);
          }
        }
        results.push({ id, success: true });
      }
    }
    res.json({ message: 'Bulk approval processed', results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Financial Reports (Admin Only)
app.get(`${API_BASE}/admin/reports/profit`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { start, end } = req.query;
    const reports = require('./services/reports/financialReports');
    const data = await reports.getProfitReport(start || new Date(Date.now() - 30*24*60*60*1000), end || new Date());
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check SmileOne Session (Admin Only)
app.get(`${API_BASE}/admin/smileone-session`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const sessionManager = require('./services/smileone/sessionManager');
    const result = await sessionManager.checkSession();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Plati Stock (Admin Only)
app.get(`${API_BASE}/admin/plati-stock/:gameId`, auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const Game = require('./models/Game');
    const game = await Game.findById(req.params.gameId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const stockMonitor = require('./services/plati/stockMonitor');
    const result = await stockMonitor.checkStockForGame(game);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  
  // Ensure CORS headers are present even on errors
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(err.status || 500).json({
    error: isProduction ? 'Internal Server Error' : err.message,
    path: isProduction ? undefined : req.path
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
