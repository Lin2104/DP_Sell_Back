const { Telegraf, Markup, session } = require('telegraf');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Game = require('../models/Game');
const Product = require('../models/Product');
const PaymentMethod = require('../models/PaymentMethod');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot;

if (botToken) {
  bot = new Telegraf(botToken);
} else {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set. Bot will not be initialized.');
  // Create a mock bot object to prevent crashes if it's used elsewhere
  bot = {
    launch: async () => console.warn('Bot launch skipped: No token'),
    on: () => {},
    command: () => {},
    action: () => {},
    use: () => {},
    handleUpdate: async () => {},
    start: () => {},
    help: () => {},
    hears: () => {},
    catch: () => {},
    stop: async () => {},
    telegram: {
      sendMessage: async () => console.warn('Bot sendMessage skipped: No token'),
      sendPhoto: async () => console.warn('Bot sendPhoto skipped: No token'),
    }
  };
}

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Photo paths
const RECEIVE_PHOTO_PATH = path.join(__dirname, '../public/Receive_Photo.jpg');
const THANKS_PHOTO_PATH = path.join(__dirname, '../public/Thanks_Photo.jpg');
const CANCEL_PHOTO_PATH = path.join(__dirname, '../public/Cancel_Photo.jpg');

// Set API_URL and ADMIN_TOKEN from environment variables
const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// Ensure ADMIN_TOKEN is set
if (!ADMIN_TOKEN) {
  console.error('ADMIN_TOKEN is not set. Admin bot actions will fail.');
}

// Helper to check if a game is Mobile Legends
const isMobileLegends = (game) => {
  if (!game) return false;
  const name = (game.name?.toLowerCase() || '').replace(/[^a-z0-9]/g, '');
  const catName = (game.categoryId?.name?.toLowerCase() || '').replace(/[^a-z0-9]/g, '');
  return name.includes('mobilelegend') || 
         name.includes('mlbb') || 
         catName.includes('mobilelegend') || 
         catName.includes('mlbb');
};

const isSmileOneSupported = (game) => {
  if (!game) return false;
  const name = (game.name?.toLowerCase() || '').replace(/[^a-z0-9]/g, '');
  return name.includes('mobilelegend') || 
         name.includes('mlbb') || 
         name.includes('pubg');
};

// Helper to safely edit message (avoids "message is not modified" error)
const safeEdit = async (ctx, text, extra = {}) => {
  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, extra);
    } else {
      await ctx.reply(text, extra);
    }
  } catch (err) {
    if (err.description && err.description.includes('message is not modified')) {
      return;
    }
    console.error('safeEdit error:', err);
    // Fallback to reply if edit fails
    try { await ctx.reply(text, extra); } catch (e) {}
  }
};

// Use session for user state tracking
bot.use(session());

// Initial session state
const initSession = (ctx) => {
  if (!ctx.session) {
    ctx.session = {
      step: 'idle',
      game: null,
      product: null,
      gameId: '',
      zoneId: '',
      customerName: '',
      paymentMethod: null
    };
  }
};

// Main Menu Reply Keyboard (Persistent at bottom)
const mainMenu = Markup.keyboard([
  ['🛍️ Start Shopping', '📦 My Orders'],
  ['💬 Contact Support', '📞 Help']
]).resize().persistent();

// Reusable category display logic
const showCategories = async (ctx, isNewMessage = true) => {
  initSession(ctx);
  ctx.session.step = 'idle';
  
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    if (categories.length === 0) {
      return ctx.reply('No categories available yet.', mainMenu);
    }

    const buttons = categories.map(cat => [Markup.button.callback(cat.name, `cat_${cat._id}`)]);
    buttons.push([Markup.button.callback('🔍 Check My Order Status', 'order_status')]);

    const keyboard = Markup.inlineKeyboard(buttons);
    const text = 'Choose a category to browse products:';

    if (isNewMessage) {
      await ctx.reply(text, {
        ...mainMenu,
        ...keyboard
      });
    } else {
      await safeEdit(ctx, text, keyboard);
    }
  } catch (err) {
    console.error('showCategories error:', err);
    ctx.reply('Something went wrong. Please try again later.', mainMenu);
  }
};

// Start command
bot.start(async (ctx) => {
  // Set bot commands (shows the 'Menu' button beside the text box)
  try {
    await ctx.telegram.setMyCommands([
      { command: 'start', description: '🛍️ Open Shop & Menu' },
      { command: 'orders', description: '📦 My Order Status' },
      { command: 'support', description: '💬 Get Help' }
    ]);
  } catch (e) { console.error('Failed to set commands:', e); }

  await ctx.reply('Welcome to the Blasky Game Shop! 💎\nUse the menu below or the "Menu" button beside the text box to navigate:', mainMenu);
  await showCategories(ctx, true);
});

bot.command('orders', async (ctx) => {
  initSession(ctx);
  ctx.session.step = 'checking_status';
  ctx.reply('Please provide your Order ID:', mainMenu);
});

bot.command('support', (ctx) => {
  const supportBotUsername = process.env.SUPPORT_BOT_USERNAME || 'Blasky_Support_Bot';
  ctx.reply(`Need help? Our AI support team is available 24/7. \n\nPlease message @${supportBotUsername} for assistance.`, mainMenu);
});

// Handle Custom Keyboard Text
bot.hears('🛍️ Start Shopping', async (ctx) => {
  await showCategories(ctx, true);
});

bot.hears('📦 My Orders', async (ctx) => {
  initSession(ctx);
  ctx.session.step = 'checking_status';
  ctx.reply('Please provide your Order ID:');
});

bot.hears('💬 Contact Support', (ctx) => {
  const supportBotUsername = process.env.SUPPORT_BOT_USERNAME || 'Blasky_Support_Bot';
  ctx.reply(
    `💬 Need human assistance?\n\n` +
    `Click the button below to chat with our support team:\n\n` +
    `👉 @${supportBotUsername}\n\n` +
    `Our team is available 24/7 to help you!`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 Chat with Support', url: `https://t.me/${supportBotUsername}` }]
        ]
      }
    }
  );
});

bot.hears('📞 Help', (ctx) => {
  const supportBotUsername = process.env.SUPPORT_BOT_USERNAME || 'Blasky_Support_Bot';
  ctx.reply(
    `📞 Contact Support\n\n` +
    `For immediate assistance, please contact our support team:\n\n` +
    `👉 @${supportBotUsername}\n\n` +
    `You can ask about:\n` +
    `• Order status\n` +
    `• Payment issues\n` +
    `• Product setup\n` +
    `• Website problems`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 Contact Support Now', url: `https://t.me/${supportBotUsername}` }]
        ]
      }
    }
  );
});

// Handle Category Selection
bot.action(/^cat_/, async (ctx) => {
  const categoryId = ctx.match.input.split('_')[1];
  try {
    const games = await Game.find({ categoryId, isActive: true }).sort({ name: 1 });
    if (games.length === 0) {
      return ctx.answerCbQuery('No games found in this category.');
    }

    const buttons = games.map(game => [Markup.button.callback(game.name, `game_${game._id}`)]);
    buttons.push([Markup.button.callback('⬅️ Back to Categories', 'back_to_cats')]);

    await safeEdit(ctx, 'Choose your game/service:', Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error('Category action error:', err);
    ctx.answerCbQuery('Error loading games.');
  }
});

bot.action('back_to_cats', async (ctx) => {
  await showCategories(ctx, false);
});

// Handle Game Selection
bot.action(/^game_/, async (ctx) => {
  const gameId = ctx.match.input.split('_')[1];
  initSession(ctx);
  
  try {
    const game = await Game.findById(gameId).populate('categoryId');
    const products = await Product.find({ gameId, isActive: true });
    
    if (products.length === 0) {
      return ctx.answerCbQuery('No products available for this game.');
    }

    ctx.session.game = game;
    ctx.session.step = 'selecting_product';

    const buttons = products.map(p => [Markup.button.callback(`${p.name} - ${p.price} MMK`, `prod_${p._id}`)]);
    buttons.push([Markup.button.callback('⬅️ Back to Games', `cat_${game.categoryId._id}`)]);

    await safeEdit(ctx, `Selected: ${game.name}\n\nChoose your amount:`, Markup.inlineKeyboard(buttons));
  } catch (err) {
    console.error('Game action error:', err);
    ctx.answerCbQuery('Error loading products.');
  }
});

// Handle Product Selection
bot.action(/^prod_/, async (ctx) => {
  const productId = ctx.match.input.split('_')[1];
  initSession(ctx);

  try {
    const product = await Product.findById(productId);
    ctx.session.product = product;

    const game = ctx.session.game;
    console.log(`[Bot] Product selected: ${product.name} for game: ${game?.name} (Cat: ${game?.categoryId?.name})`);
    
    const isDigitalProduct = game.categoryId?.type === 'digital-product';
    const isML = isMobileLegends(game);
    
    let prompt = `Selected: ${product.name} (${product.price} MMK)\n\n`;
    if (isDigitalProduct) {
      ctx.session.step = 'awaiting_customer_name';
      prompt += '👤 Please provide your Name:';
    } else if (isML) {
      ctx.session.step = 'awaiting_ml_id_zone';
      prompt += '🎮 Please provide your Player ID and Zone ID in the format: PlayerID (ZoneID) \nExample: 12345678 (1234)';
    } else {
      ctx.session.step = 'awaiting_game_id';
      prompt += '🆔 Please provide your Player ID:';
    }
    
    await safeEdit(ctx, prompt);
  } catch (err) {
    console.error('Product action error:', err);
    ctx.answerCbQuery('Error selecting product.');
  }
});

// Handle Text Input (Game IDs or Order ID)
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const chatId = ctx.chat.id;
  initSession(ctx);

  console.log(`[Bot] Message from ${chatId}: "${text}" (Step: ${ctx.session.step})`);

  // Admin forward logic
  if (chatId.toString() === ADMIN_CHAT_ID) {
    const aiAgent = require('../ai/agent');
    const agent = aiAgent.getAgent();
    if (agent) {
      ctx.reply("🤖 AI Manager is processing your request...");
      await agent.handleUserMessage(text, chatId);
      return;
    }
  }

  // Check order status logic
  if (ctx.session.step === 'checking_status') {
    try {
      const order = await Order.findById(text);
      if (!order) return ctx.reply('Order not found.');
      ctx.reply(`Order Details:\nID: ${order._id}\nStatus: ${order.orderStatus.toUpperCase()}\nAmount: ${order.amount}`);
      ctx.session.step = 'idle';
    } catch (err) { ctx.reply('Invalid Order ID format.'); }
    return;
  }

  // Buying flow: Awaiting Customer Name (Digital Products)
  if (ctx.session.step === 'awaiting_customer_name') {
    ctx.session.customerName = text.trim();
    ctx.session.step = 'awaiting_email';
    ctx.reply('📧 Please provide your Email Address (where you want to receive the account/key):');
    return;
  }

  // Buying flow: Awaiting Email (Digital Products)
  if (ctx.session.step === 'awaiting_email') {
    if (!text.includes('@') || !text.includes('.')) {
      return ctx.reply('Please provide a valid email address (e.g., example@gmail.com).');
    }
    ctx.session.gameId = `Email: ${text.trim()}`;
    
    // Proceed to payment
    const paymentMethods = await PaymentMethod.find({ isActive: true });
    const buttons = paymentMethods.map(pm => [Markup.button.callback(pm.name, `pay_${pm._id}`)]);
    ctx.reply('Got it! Now choose your payment method:', Markup.inlineKeyboard(buttons));
    ctx.session.step = 'selecting_payment';
    return;
  }

  // Buying flow: Awaiting ML ID and Zone ID (Combined)
  if (ctx.session.step === 'awaiting_ml_id_zone') {
    // Match format like "12345678 (1234)" or "12345678/1234"
    const match = text.match(/^(\d+)\s*\((\d+)\)$/) || text.match(/^(\d+)\/(\d+)$/);
    if (!match) {
      return ctx.reply('⚠️ Please provide your ID and Zone in the format: PlayerID (ZoneID) \nExample: 12345678 (1234)');
    }
    ctx.session.gameId = match[1].trim();
    ctx.session.zoneId = match[2].trim();
    ctx.session.step = 'selecting_payment';
    
    const paymentMethods = await PaymentMethod.find({ isActive: true });
    const buttons = paymentMethods.map(pm => [Markup.button.callback(pm.name, `pay_${pm._id}`)]);
    
    ctx.reply('Got it! Now choose your payment method:', Markup.inlineKeyboard(buttons));
    return;
  }

  // Buying flow: Awaiting Player ID (Mobile Legends) - Old Fallback removed
  // Buying flow: Awaiting Zone ID (Mobile Legends) - Old Fallback removed

  // Buying flow: Awaiting Game ID / Player ID (Top-ups)
  if (ctx.session.step === 'awaiting_game_id') {
    const isML = isMobileLegends(ctx.session.game);
    if (isML) {
      // Emergency fix: If it's ML but we ended up here, treat it as a combined input
      const match = text.match(/^(\d+)\s*\((\d+)\)$/) || text.match(/^(\d+)\/(\d+)$/);
      if (match) {
        ctx.session.gameId = match[1].trim();
        ctx.session.zoneId = match[2].trim();
      } else {
        // Just store the ID, we'll have to deal with missing zone or ask for it
        ctx.session.gameId = text.trim();
        ctx.session.step = 'awaiting_zone_id_emergency';
        return ctx.reply('🎮 Detected Mobile Legends! Please provide your Zone ID (e.g., 1234):');
      }
    } else {
      ctx.session.gameId = text.trim();
    }
    
    ctx.session.step = 'selecting_payment';
    const paymentMethods = await PaymentMethod.find({ isActive: true });
    const buttons = paymentMethods.map(pm => [Markup.button.callback(pm.name, `pay_${pm._id}`)]);
    
    ctx.reply('Got it! Now choose your payment method:', Markup.inlineKeyboard(buttons));
    return;
  }

  // Emergency Zone ID handler
  if (ctx.session.step === 'awaiting_zone_id_emergency') {
    ctx.session.zoneId = text.trim();
    ctx.session.step = 'selecting_payment';
    const paymentMethods = await PaymentMethod.find({ isActive: true });
    const buttons = paymentMethods.map(pm => [Markup.button.callback(pm.name, `pay_${pm._id}`)]);
    ctx.reply('Got it! Now choose your payment method:', Markup.inlineKeyboard(buttons));
    return;
  }

  // Admin Rejection Reason handler
  if (ctx.session.step === 'awaiting_rejection_reason' && String(ctx.chat.id) === String(ADMIN_CHAT_ID)) {
    const reason = text.trim();
    const orderId = ctx.session.orderIdToReject;
    
    try {
      const updatedOrder = await axios.patch(`${process.env.API_URL}/orders/${orderId}/status`, {
        orderStatus: 'rejected',
        paymentStatus: 'rejected',
        rejectionReason: reason
      }, {
        headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
      });

      const caption = `📦 Order Update (${updatedOrder.data.gameType})!\n\n` +
        `Game: ${updatedOrder.data.gameId?.name || 'N/A'}\n` +
        `User Game ID: ${updatedOrder.data.transactionId || 'N/A'}\n` +
        `Order ID: ${updatedOrder.data._id}\n` +
        `Status: REJECTED\n` +
        `Reason: ${reason}`;

      await ctx.reply(`✅ Order ${orderId} rejected with reason: ${reason}`);
      
      // Reset session
      ctx.session.step = 'idle';
      delete ctx.session.orderIdToReject;
    } catch (err) {
      console.error('Rejection reason processing error:', err);
      ctx.reply('Error processing rejection. Please try again.');
    }
    return;
  }
});

// Handle Payment Method Selection
bot.action(/^pay_/, async (ctx) => {
  const pmId = ctx.match.input.split('_')[1];
  initSession(ctx);

  try {
    const pm = await PaymentMethod.findById(pmId);
    ctx.session.paymentMethod = pm;
    ctx.session.step = 'awaiting_screenshot';

    await safeEdit(ctx, 
      `💳 Payment Details:\n\n` +
      `Bank: ${pm.name}\n` +
      `Account Name: ${pm.accountName}\n` +
      `Phone/Number: ${pm.phoneNumber}\n\n` +
      `Please send us a screenshot of your payment transfer:`,
      Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_order')]])
    );
  } catch (err) {
    ctx.answerCbQuery('Error selecting payment method.');
  }
});

// Handle Photo Input (Payment Screenshot)
bot.on('photo', async (ctx) => {
  initSession(ctx);
  if (ctx.session.step !== 'awaiting_screenshot') return;

  ctx.reply('Uploading payment proof and creating order... ⏳');

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get largest size
    const fileId = photo.file_id;
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    
    // Download and convert to base64
    const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
    const base64 = `data:image/jpeg;base64,${Buffer.from(response.data).toString('base64')}`;

    // Create order
    const orderData = {
      gameType: ctx.session.game.name,
      gameId: ctx.session.game._id,
      productId: ctx.session.product._id,
      zoneId: ctx.session.zoneId || undefined,
      amount: `${ctx.session.product.name} (${ctx.session.product.price} MMK)`,
      paymentMethod: ctx.session.paymentMethod.name,
      transactionScreenshot: base64,
      transactionId: ctx.session.gameId, // This is the Player ID / Game ID / Email entered by user
      customerInfo: {
        name: ctx.session.customerName || ctx.from.first_name || 'TG User',
        telegramId: ctx.chat.id.toString()
      }
    };

    // If it's a digital product, the gameId session variable might contain the email
    if (ctx.session.gameId && ctx.session.gameId.startsWith('Email: ')) {
      orderData.customerInfo.email = ctx.session.gameId.replace('Email: ', '');
    }

    const order = new Order(orderData);
    await order.save();

    // Reset session
    ctx.session.step = 'idle';

    // Notify Admin
    const caption = `📦 New Telegram Order!\n\n` +
      `User: ${order.customerInfo.name}\n` +
      `Game: ${order.gameType}\n` +
      `User Game ID: ${order.transactionId}\n` + // Use transactionId for user's Game ID
      (order.zoneId ? `Zone ID: ${order.zoneId}\n` : '') +
      (order.customerInfo.email ? `Email: ${order.customerInfo.email}\n` : '') +
      `Amount: ${order.amount}\n` +
      `Order ID: ${order._id}`;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback('🚀 Auto', `approve_${order._id}`)],
      [Markup.button.callback('✅ Manual', `finish_${order._id}`)],
      [Markup.button.callback('❌ Reject', `cancel_${order._id}`)]
    ]);

    await bot.telegram.sendPhoto(ADMIN_CHAT_ID, { source: Buffer.from(response.data) }, {
      caption,
      ...buttons
    });

    // Send Receive_Photo to customer
    if (fs.existsSync(RECEIVE_PHOTO_PATH)) {
      await ctx.replyWithPhoto({ source: fs.readFileSync(RECEIVE_PHOTO_PATH) }, {
        caption: `✅ Success! Your order has been placed (ID: ${order._id}). We will notify you once it's completed.`
      });
    } else {
      ctx.reply(`✅ Success! Your order has been placed (ID: ${order._id}). We will notify you once it's completed.`);
    }
  } catch (err) {
    console.error('Photo processing error:', err);
    ctx.reply('Failed to process screenshot. Please try again.');
  }
});

bot.action('order_status', (ctx) => {
  initSession(ctx);
  ctx.session.step = 'checking_status';
  ctx.reply('Please provide your Order ID:');
});

bot.action('cancel_order', async (ctx) => {
  initSession(ctx);
  ctx.session.step = 'idle';
  await safeEdit(ctx, 'Order cancelled. Use /start to browse again.');
});

// Helper to update status message (handles both photo captions and text messages)
const updateStatus = async (ctx, text) => {
  try {
    if (ctx.callbackQuery.message.photo) {
      await ctx.editMessageCaption(text);
    } else {
      await ctx.editMessageText(text);
    }
  } catch (err) {
    console.error('Failed to update status message:', err);
  }
};

// Handle Admin Actions (Approve, Finish, Cancel)
bot.action(/^(approve|finish|cancel)_/, async (ctx) => {
  const [action, orderId] = ctx.match.input.split('_');
  
  try {
    const order = await Order.findById(orderId).populate('gameId');
    if (!order) {
      return ctx.answerCbQuery('Order not found.');
    }

    let newOrderStatus = order.orderStatus;
    let newPaymentStatus = order.paymentStatus;
    let message = '';
    let isAuto = false;

    if (action === 'approve') {
      newOrderStatus = 'processing';
      newPaymentStatus = 'paid';
      message = `Order ${orderId} approved for Auto Top-up.`;
      isAuto = true;
    } else if (action === 'finish') {
      newOrderStatus = 'completed';
      newPaymentStatus = 'paid';
      message = `Order ${orderId} marked as Completed (Manual).`;
      isAuto = false;
    } else if (action === 'cancel') {
      // Don't update status yet, ask for reason first
      initSession(ctx);
      ctx.session.step = 'awaiting_rejection_reason';
      ctx.session.orderIdToReject = orderId;
      return ctx.reply(`Please provide a reason for rejecting Order ${orderId}:`, Markup.forceReply());
    }

    const updatedOrder = await axios.patch(`${process.env.API_URL}/orders/${orderId}/status`, {
      orderStatus: newOrderStatus,
      paymentStatus: newPaymentStatus,
      isAuto: isAuto
    }, {
      headers: { Authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
    });

    // Redefine buttons for the updated message (remove if completed/rejected)
    let buttons = null;
    if (newOrderStatus !== 'completed' && newOrderStatus !== 'rejected') {
      buttons = Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Auto', `approve_${orderId}`)],
        [Markup.button.callback('✅ Manual', `finish_${orderId}`)],
        [Markup.button.callback('❌ Reject', `cancel_${orderId}`)]
      ]);
    }

    // Update the original message to reflect the new status
    const game = updatedOrder.data.gameId; // Populated game from backend
    
    // Add automation status if applicable
    let autoStatus = '';
    if (action === 'approve' && isSmileOneSupported(game)) {
      autoStatus = `\n🤖 <b>SmileOne Automation Triggered!</b>\n`;
    }

    const caption = `📦 Order Update (${updatedOrder.data.gameType})!\n\n` +
      `Game: ${game ? game.name : 'N/A'}\n` +
      `User Game ID: ${updatedOrder.data.transactionId || 'N/A'}\n` + // Use transactionId for user's Game ID
      (updatedOrder.data.zoneId ? `Zone ID: ${updatedOrder.data.zoneId}\n` : '') +
      (updatedOrder.data.customerInfo?.email ? `Customer Email: ${updatedOrder.data.customerInfo.email}\n` : '') +
      `Amount: ${updatedOrder.data.amount}\n` +
      `Payment: ${updatedOrder.data.paymentMethod}\n` +
      `Order ID: ${updatedOrder.data._id}\n` +
      `Status: ${updatedOrder.data.orderStatus.toUpperCase()} / ${updatedOrder.data.paymentStatus.toUpperCase()}\n` +
      autoStatus;
    
    const extra = { parse_mode: 'HTML' };
    if (buttons) Object.assign(extra, buttons);

    if (updatedOrder.data.transactionScreenshot) {
      const base64Data = updatedOrder.data.transactionScreenshot.split(',')[1]; // Extract base64 part
      const photoSource = Buffer.from(base64Data, 'base64');
      
      // If message was already a photo, we should try to edit it or send a new one
      // To avoid duplication and "repeatly send admin as order update message",
      // we only send a new message if it wasn't already updated or if we can't edit.
      if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(caption, { parse_mode: 'HTML', ...extra });
      } else {
        await bot.telegram.sendPhoto(ctx.chat.id, { source: photoSource }, {
          caption: caption,
          ...extra
        });
      }
    } else {
      await safeEdit(ctx, caption, extra);
    }

    // Send Thanks_Photo to customer if completed (Already handled by backend index.js, 
    // but we can keep it here for redundancy or move logic entirely to backend)
    // Actually, backend index.js has this logic:
    // if (order.orderStatus === 'completed' && prevStatus !== 'completed') { ... send Thanks_Photo ... }
    
    ctx.answerCbQuery(message);

  } catch (err) {
    console.error('Admin action error:', err);
    ctx.answerCbQuery('Error processing action.');
  }
});

module.exports = bot;
