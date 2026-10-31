# Blasky Game Shop - Backend & AI System

Blasky Game Shop is a comprehensive digital commerce platform specializing in game top-ups and digital product keys. It features a dual-bot Telegram system, a robust backend with MongoDB, and an advanced AI agent for customer support and shop management.

## 🚀 Core Features

- **Dual Telegram Bot System**:
  - **Main Shop Bot**: Handles product browsing, ordering, and payment submission.
  - **Support Bot**: Powered by AI to provide 24/7 customer assistance in Myanmar and English.
- **AI Automation**: 
  - Automated shop management (adding categories/games/products via AI).
  - Intelligent search and product recommendations.
  - Order status tracking and automated admin notifications.
- **Plati.market Integration**:
  - Automated stock monitoring and price synchronization.
  - Automated purchase flow with queue-based processing.
  - Scraper for fetching digital keys and account info.
- **SmileOne Integration**:
  - Background queue for automated Mobile Legends and PUBG top-ups.
  - Balance monitoring and low-balance alerts for admins.
- **Advanced Caching**: Local JSON catalog cache to minimize database latency and AI payload size.
- **Image Management**: Integrated with Cloudinary for secure and fast image hosting.

## 🛠 Tech Stack

- **Runtime**: Node.js (v20+)
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose)
- **Caching/Queue**: Redis (BullMQ)
- **AI Engine**: Google Gemini 2.0 Flash (via OpenRouter)
- **Bot Framework**: Telegraf
- **Automation**: Playwright (Browser automation for Plati/SmileOne)
- **Media Hosting**: Cloudinary

## 📂 Project Structure

- `ai/`: AI agent logic, tools, and prompts.
- `bot/`: Telegram bot implementations (Main & Support).
- `models/`: Mongoose schemas (Order, Game, Product, etc.).
- `services/`: Core business logic.
  - `plati/`: Plati.market automation (Purchase, Scraper, Stock).
  - `smileone/`: SmileOne automation and balance checks.
  - `reports/`: Financial reporting logic.
- `scripts/`: Data import and utility scripts.
- `data/`: Local cache storage (`catalog_cache.json`).

## ⚙️ Workflows

### 1. Customer Ordering Flow
1. User starts **Main Bot** and browses categories (e.g., Steam, Top-Up).
2. User selects a game and product.
3. For top-ups (like MLBB), user provides Player ID and Zone ID.
4. User uploads a payment screenshot and provides Transaction ID.
5. Order is saved in MongoDB with `pending` status.
6. Admin receives a notification to verify the payment.

### 2. AI Support Workflow
1. User messages the **Support Bot**.
2. AI (Gemini 2.0 Flash) analyzes the query using local catalog cache.
3. AI can:
   - Search for specific games/products.
   - Show prices and categories.
   - Check order status for the user.
   - Escalate to a human admin if needed.

### 3. Automated Purchase (Plati)
1. Once a digital product order is marked `processing`, it enters the `plati-purchases` queue.
2. A background worker launches a browser, logs into Plati, and initiates the purchase.
3. If successful, the scraper fetches the key/details and emails them to the customer.
4. If out of stock, it alerts the admin and updates the order status.

### 4. Stock & Balance Monitoring
- **Plati**: Periodically checks Plati URLs for stock availability and alerts admin on stock-outs.
- **SmileOne**: Monitors account balance and sends Telegram alerts if funds are low.

## 🛠 Setup & Installation

1. **Clone the repository**:
   ```bash
   git clone <repo-url>
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Environment Variables**:
   Create a `.env` file based on the required keys:
   - `MONGODB_URI`, `REDIS_HOST`, `REDIS_PORT`
   - `TELEGRAM_BOT_TOKEN`, `SUPPORT_BOT_TOKEN`, `ADMIN_CHAT_ID`
   - `OPENROUTER_API_KEY` (for AI features)
   - `CLOUDINARY_URL`, `PLATI_EMAIL`, `PLATI_PASSWORD`

4. **Run the application**:
   - Start API & Main Bot: `npm start`
   - Start Support Bot: `npm run start:support`

## 🛡 Security & Resilience
- **Rate Limiting**: Express-rate-limit to prevent API abuse.
- **Bot Recovery**: Automatic 10-second recovery after bot crashes.
- **AI Retry Logic**: 5-attempt retry system for AI rate limits (429/504).
- **Audit Logging**: Tracks critical admin actions for security.

---
*Blasky Game Shop - Empowering Gamers with AI-Driven Automation.*
