const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const tools = require("../ai/tools"); // Added tools import
require('dotenv').config();

const supportBotToken = process.env.SUPPORT_BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
let supportBot;

if (supportBotToken) {
    supportBot = new Telegraf(supportBotToken);
} else {
    console.warn('⚠️ SUPPORT_BOT_TOKEN is not set. Support bot will not be initialized.');
    supportBot = {
        launch: async () => console.warn('Support bot launch skipped: No token'),
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
            sendMessage: async () => console.warn('Support bot sendMessage skipped: No token'),
            sendPhoto: async () => console.warn('Support bot sendPhoto skipped: No token'),
        }
    };
}

// OpenRouter configuration for AI
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL = "google/gemini-2.0-flash-001";

// Define tools for the support bot (same as agent.js but focused on support)
const supportTools = [
    {
        type: "function",
        function: {
            name: "search_products",
            description: "Search the internal database for specific games or products listed in the shop.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "The product or game name to search for (e.g. 'Wukong')." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_catalog",
            description: "Get all available categories in the store.",
            parameters: {
                type: "object",
                properties: {},
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_games_by_category",
            description: "Get all games within a specific category.",
            parameters: {
                type: "object",
                properties: {
                    categoryId: { type: "string", description: "The ID of the category." }
                },
                required: ["categoryId"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_products_by_game",
            description: "Get all available products (prices/options) for a specific game.",
            parameters: {
                type: "object",
                properties: {
                    gameId: { type: "string", description: "The ID of the game." }
                },
                required: ["gameId"]
            }
        }
    }
];

// Persistent Reply Keyboard (beside the typing bar)
const supportKeyboard = Markup.keyboard([
    ['👤 Speak with Human']
]).resize().persistent();

const mainMenuSupport = (chatId) => [
    [{ text: '💬 Start Chat', url: `https://t.me/${process.env.SUPPORT_BOT_USERNAME || 'Blasky_Support_Bot'}` }],
    [{ text: '📦 Check Order', callback_data: `support_order_${chatId}` }],
    [{ text: '👤 Speak with Human', callback_data: `support_human` }]
];

const systemPrompt = `You are the professional AI Customer Support for "Blasky Game Shop".
Your goal is to provide accurate help to customers in Myanmar (Burmese) language.

### SHOP CONTEXT:
- If a customer asks to buy a game (e.g., "I want to buy Wukong"), ALWAYS use 'search_products' first with a specific query.
- Only use 'get_catalog' if they want to see all categories.
- To show games in a category, use 'get_games_by_category'.
- To show specific prices/items for a game, use 'get_products_by_game'.
- IMPORTANT: Minimize data fetching. Don't fetch the whole catalog if you can search for a specific item.
- If found, show the price and details politely in Myanmar.

### 1. SHOPPING & ORDERING FLOW
- Customers browse categories (Top-up, Digital Products, etc.).
- After selecting a game and product, they must provide specific details:
  * MOBILE LEGENDS: Requires "Player ID" and "Zone ID" (Example: 12345678 (1234)).
  * DIGITAL PRODUCTS (Steam keys, VPNs, etc.): Requires "Name" and "Email Address".
  * OTHER GAMES: Usually requires "Player ID" or "Account ID".
- Once details are provided, they choose a Payment Method.

### 2. PAYMENT PROCESS
- We support manual transfers (Kpay, WavePay, etc.) and MMQR (automated).
- For manual transfers, customers MUST upload a "Screenshot" of the payment success.
- After uploading, an Order is created with a unique "Order ID".

### 3. ORDER STATUSES
- PENDING: Order created, waiting for admin to check the payment screenshot.
- PROCESSING: Admin has verified the payment and is working on the delivery.
- COMPLETED: The product has been sent or the top-up is finished.
- REJECTED: Order cancelled (e.g., wrong ID, payment not received).

### 4. DELIVERY METHOD
- TOP-UPS: Added directly to the customer's game account.
- DIGITAL PRODUCTS: Keys are automatically sent to the customer's "Email" as a PDF file (including a setup guide) once the admin marks the order as COMPLETED.

### 5. HOW TO HELP CUSTOMERS
- If they ask about their order: Ask for their "Order ID" and explain they can check status in the main bot.
- If they have payment issues: Tell them to ensure the "Screenshot" is clear and the "Transaction ID" is visible.
- If they didn't receive a Digital Product: Tell them to check their "Email" (including Spam folder) for the PDF key.

### 6. HUMAN ESCALATION (CRITICAL)
- If a customer asks a question you cannot answer based on the rules above, or if they are clearly frustrated/unhappy, or if they explicitly ask for a human/person, you MUST escalate.
- To escalate, you must output a specific keyword: "TRANSFER_TO_HUMAN" followed by a very brief summary of their problem in English.
- Example: "TRANSFER_TO_HUMAN - User having issues with payment verification"
- Do not say anything else in the same message as the keyword.

### VISUAL FORMATTING RULES (CRITICAL):
- Use clear bullet points and emojis for better readability.
- Use bold text sparingly for emphasis on technical terms.
- Add double newlines between sections to avoid crowded text.
- Use decorative dividers like "━━━━━━━━━━━━━━" to separate major sections.
- Ensure the Myanmar text flows naturally and is not overly formal or robotic.

### LANGUAGE RULES (STRICT):
- ALWAYS respond in Myanmar (Burmese) language for general conversation and explanations.
- ALWAYS use English for technical terms: "system", "My Folder", "Properties", "Settings", "Download", "Install", "VPN", "Steam", "Windows", "Account", "Email", "Password", "ID", "Order", "Status", "Payment", "Screenshot", "App", "Website", "Browser", "Server", "Login", "Cart", "Checkout", "Digital Key", "Product Guide".
- TONE: Extremely polite, helpful, and patient. ALWAYS use male honorifics "ခင်ဗျာ" (Khin Byar). NEVER use "ရှင်" (Shin).`;

let chatHistories = {};

async function getAIResponse(userId, userMessage) {
    if (!OPENROUTER_API_KEY) {
        return "⚠️ AI Support is currently unavailable (API Key missing). Please speak with a human.";
    }

    if (!chatHistories[userId]) {
        chatHistories[userId] = [
            { role: "system", content: systemPrompt }
        ];
    }

    chatHistories[userId].push({ role: "user", content: userMessage });

    try {
        console.log(`[AI Request] User: ${userId}, Model: ${PRIMARY_MODEL}`);
        
        let iterations = 0;
        const MAX_ITERATIONS = 3;

        while (iterations < MAX_ITERATIONS) {
            iterations++;
            
            let retryCount = 0;
            const MAX_RETRIES = 5;
            let response;

            while (retryCount < MAX_RETRIES) {
                try {
                    response = await axios.post(OPENROUTER_URL, {
                        model: PRIMARY_MODEL,
                        messages: chatHistories[userId],
                        tools: supportTools,
                        tool_choice: "auto"
                    }, {
                        headers: {
                            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                            "HTTP-Referer": "https://blasky-game-shop.com",
                            "X-Title": "Blasky Game Shop Support Bot",
                            "Content-Type": "application/json"
                        },
                        timeout: 60000 
                    });
                    break; // Success, exit retry loop
                } catch (apiErr) {
                    retryCount++;
                    const status = apiErr.response ? apiErr.response.status : null;
                    
                    const isRetryable = status === 504 || status === 502 || status === 503 || status === 429 || !status;
                    
                    if (isRetryable && retryCount < MAX_RETRIES) {
                        const delay = Math.pow(2, retryCount) * 2000; // 4s, 8s, 16s, 32s
                        console.warn(`[AI Retry] Attempt ${retryCount} failed with ${status || apiErr.message}. Retrying in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    throw apiErr; 
                }
            }

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                throw new Error('Invalid response format from OpenRouter');
            }

            const responseData = response.data.choices[0].message;

            // If it's a tool call
            if (responseData.tool_calls && responseData.tool_calls.length > 0) {
                chatHistories[userId].push(responseData);
                
                for (const call of responseData.tool_calls) {
                    const functionName = call.function.name;
                    const functionArgs = JSON.parse(call.function.arguments);

                    console.log(`[Support AI] Calling tool: ${functionName} with args: ${JSON.stringify(functionArgs)}`);
                    
                    if (tools[functionName]) {
                        const toolResult = await tools[functionName](functionArgs);
                        chatHistories[userId].push({
                            role: "tool",
                            tool_call_id: call.id,
                            content: JSON.stringify(toolResult)
                        });
                    }
                }
                // Continue the loop to get the AI's response to the tool results
                continue;
            }

            // If it's a normal message
            const aiResponse = responseData.content;
            console.log(`[AI Response] Success for user: ${userId}`);
            chatHistories[userId].push({ role: "assistant", content: aiResponse });

            if (chatHistories[userId].length > 15) {
                chatHistories[userId] = [
                    { role: "system", content: systemPrompt },
                    ...chatHistories[userId].slice(-12)
                ];
            }

            return aiResponse;
        }

        return "⚠️ Support system is temporarily overwhelmed. Please try again.";

    } catch (err) {
        console.error('AI Error Details:', {
            status: err.response?.status,
            data: err.response?.data,
            message: err.message,
            userId: userId
        });
        
        if (err.response?.status === 401) return "⚠️ AI Configuration Error: API Key is invalid.";
        if (err.response?.status === 402) return "⚠️ AI Credit Error: OpenRouter account has insufficient credits.";
        
        return "⚠️ Support system is temporarily unavailable. Please try again later or speak with a human.";
    }
}

supportBot.start(async (ctx) => {
    const chatId = ctx.chat.id.toString();
    // Reset chat history on start
    delete chatHistories[chatId];

    await ctx.reply(
        `🙏 Blasky Game Shop Support မှ ကြိုဆိုပါတယ်ခင်ဗျာ!\n\n` +
        `ကျွန်တော်တို့အနေနဲ့ အောက်ပါအချက်အလက်တွေကို ကူညီပေးနိုင်ပါတယ်:\n` +
        `• Website အသုံးပြုပုံ မေးခွန်းများ\n` +
        `• Purchase ပြုလုပ်ရာတွင် ကြုံတွေ့ရသည့် အခက်အခဲများ\n` +
        `• Setup & configuration ပြုလုပ်ပုံ အဆင့်ဆင့်\n` +
        `• Order status နှင့် ပတ်သက်သည့် မေးမြန်းမှုများ\n` +
        `• Payment issues များ\n\n` +
        `ဘာများ ကူညီပေးရမလဲခင်ဗျာ?`,
        { 
            parse_mode: 'HTML',
            ...supportKeyboard,
            reply_markup: {
                ...supportKeyboard.reply_markup,
                inline_keyboard: mainMenuSupport(chatId)
            }
        }
    );
});

supportBot.help(async (ctx) => {
    const chatId = ctx.chat.id.toString();
    await ctx.reply(
        `📋 ကျွန်တော် ကူညီပေးနိုင်မည့် အရာများ:\n\n` +
        `1️⃣ Website Questions - Website အသုံးပြုပုံနှင့် Product များ ဝယ်ယူပုံ\n` +
        `2️⃣ Purchase Problems - Payment မအောင်မြင်ခြင်းနှင့် Product မရရှိခြင်း\n` +
        `3️⃣ Setup Help - VPN configuration နှင့် Steam key activation အစရှိသည်တို့\n` +
        `4️⃣ Order Status - သင့် Order ၏ Status ကို စစ်ဆေးပေးခြင်း\n` +
        `5️⃣ Payment Issues - ငွေလွှဲရာတွင် အခက်အခဲရှိခြင်းနှင့် Screenshot upload တင်ခြင်း\n\n` +
        `သိလိုသည်များကို မြန်မာလို (သို့မဟုတ်) English လို မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ!`,
        { 
            parse_mode: 'HTML',
            ...supportKeyboard,
            reply_markup: {
                ...supportKeyboard.reply_markup,
                inline_keyboard: mainMenuSupport(chatId)
            }
        }
    );
});

supportBot.hears('👤 Speak with Human', async (ctx) => {
    const adminUsername = 'linko221';
    const userLink = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
    const userDisplayName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

    // 1. Reply to User
    await ctx.reply(
        `━━━━━━━━━━━━━━\n` +
        `🙏 ကျွန်တော်တို့အနေနဲ့ လူကြီးမင်းရဲ့ အခက်အခဲကို ပိုမိုကောင်းမွန်စွာ ကူညီပေးနိုင်ဖို့အတွက် Admin နဲ့ တိုက်ရိုက်ချိတ်ဆက်ပေးပါမယ်ခင်ဗျာ။\n\n` +
        `We will transfer to Admin.\n\n` +
        `👉 @${adminUsername}\n\n` +
        `အထက်ပါ link ကိုနှိပ်ပြီး ကျွန်တော်တို့ရဲ့ Admin ကို တိုက်ရိုက် မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ။\n` +
        `━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
    );

    // 2. Alert Admin
    if (process.env.ADMIN_CHAT_ID) {
        const adminAlert = `🚨 <b>Human Support Requested via Keyboard!</b>\n\n` +
            `👤 <b>User:</b> ${userDisplayName} (${userLink})\n` +
            `👉 Click user link above to chat directly.`;
        
        await ctx.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminAlert, { parse_mode: 'HTML' });
    }
});

supportBot.on('text', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const userMessage = ctx.message.text;

    if (userMessage.startsWith('/')) return;

    await ctx.reply('⏳ Processing your request...');

    const response = await getAIResponse(chatId, userMessage);

    // Check if the AI wants to escalate to human
    if (response.includes('TRANSFER_TO_HUMAN')) {
        const adminUsername = 'linko221';
        const problemSummary = response.replace('TRANSFER_TO_HUMAN', '').replace('-', '').trim();
        const userLink = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
        const userDisplayName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

        // 1. Reply to User
        await ctx.reply(
            `━━━━━━━━━━━━━━\n` +
            `🙏 ကျွန်တော်တို့အနေနဲ့ လူကြီးမင်းရဲ့ အခက်အခဲကို ပိုမိုကောင်းမွန်စွာ ကူညီပေးနိုင်ဖို့အတွက် Admin နဲ့ တိုက်ရိုက်ချိတ်ဆက်ပေးပါမယ်ခင်ဗျာ။\n\n` +
            `We will transfer to Admin.\n\n` +
            `👉 @${adminUsername}\n\n` +
            `အထက်ပါ link ကိုနှိပ်ပြီး ကျွန်တော်တို့ရဲ့ Admin ကို တိုက်ရိုက် မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ။\n` +
            `━━━━━━━━━━━━━━`,
            { parse_mode: 'HTML' }
        );

        // 2. Alert Admin
        if (process.env.ADMIN_CHAT_ID) {
            const adminAlert = `🚨 <b>Human Support Requested!</b>\n\n` +
                `👤 <b>User:</b> ${userDisplayName} (${userLink})\n` +
                `📝 <b>Problem:</b> ${problemSummary || 'Not specified'}\n` +
                `💬 <b>Last Message:</b> <i>${userMessage}</i>\n\n` +
                `👉 Click user link above to chat directly.`;
            
            await ctx.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminAlert, { parse_mode: 'HTML' });
        }
        return;
    }

    await ctx.reply(response, { parse_mode: 'HTML' });
});

supportBot.action(/^support_order_/, async (ctx) => {
    const chatId = ctx.match.input.split('_')[2];
    await ctx.answerCbQuery();
    await ctx.reply(
        `📦 To check your order status, please provide your Order ID.\n\n` +
        `You can find it in your confirmation message or check your email.`,
        { parse_mode: 'HTML' }
    );
});

supportBot.action('support_human', async (ctx) => {
    await ctx.answerCbQuery('Connecting to support...');
    const adminUsername = 'linko221';
    const userLink = ctx.from.username ? `@${ctx.from.username}` : `tg://user?id=${ctx.from.id}`;
    const userDisplayName = ctx.from.first_name + (ctx.from.last_name ? ` ${ctx.from.last_name}` : '');

    // 1. Reply to User
    await ctx.reply(
        `━━━━━━━━━━━━━━\n` +
        `🙏 ကျွန်တော်တို့အနေနဲ့ လူကြီးမင်းရဲ့ အခက်အခဲကို ပိုမိုကောင်းမွန်စွာ ကူညီပေးနိုင်ဖို့အတွက် Admin နဲ့ တိုက်ရိုက်ချိတ်ဆက်ပေးပါမယ်ခင်ဗျာ။\n\n` +
        `We will transfer to Admin.\n\n` +
        `👉 @${adminUsername}\n\n` +
        `အထက်ပါ link ကိုနှိပ်ပြီး ကျွန်တော်တို့ရဲ့ Admin ကို တိုက်ရိုက် မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ။\n` +
        `━━━━━━━━━━━━━━`,
        { parse_mode: 'HTML' }
    );

    // 2. Alert Admin
    if (process.env.ADMIN_CHAT_ID) {
        const adminAlert = `🚨 <b>Human Support Requested via Button!</b>\n\n` +
            `👤 <b>User:</b> ${userDisplayName} (${userLink})\n` +
            `👉 Click user link above to chat directly.`;
        
        await ctx.telegram.sendMessage(process.env.ADMIN_CHAT_ID, adminAlert, { parse_mode: 'HTML' });
    }
});

const launchSupportBot = async (retryCount = 0) => {
    try {
        console.log(`[SupportBot] Launching... (Attempt ${retryCount + 1})`);
        
        // Stop existing instance with a timeout to prevent hanging
        try {
            const stopPromise = supportBot.stop();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Stop timeout')), 5000)
            );
            await Promise.race([stopPromise, timeoutPromise]);
        } catch (e) {
            console.log('[SupportBot] Stop attempt info:', e.message);
        }

        await supportBot.launch({
            allowedUpdates: ['message', 'callback_query'],
            dropPendingUpdates: true
        });
        
        console.log('✅ Support Bot is running!');
    } catch (err) {
        if ((err.message.includes('409: Conflict') || err.message.includes('timeout')) && retryCount < 5) {
            const delay = Math.pow(2, retryCount) * 5000;
            console.log(`[SupportBot] Startup issue: ${err.message}. Retrying in ${delay/1000}s...`);
            setTimeout(() => launchSupportBot(retryCount + 1), delay);
        } else {
            console.error('❌ Support Bot failed to start:', err.message);
        }
    }
};

// Global error handler for support bot to prevent "Unhandled error"
supportBot.catch((err, ctx) => {
    console.error(`[SupportBot Error] ${ctx.update_type}:`, err);
    ctx.reply('⚠️ Sorry, I encountered an internal error. Please try again or contact an admin.').catch(() => {});
});

module.exports = { supportBot, launchSupportBot };