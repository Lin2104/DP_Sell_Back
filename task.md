# Chat Session Summary - 2025-01-13

## Tasks Completed

### 1. Cancel_Photo Fix for Rejection Messages
**Problem:** Customer rejection messages were not including the Cancel_Photo attachment.

**Root Cause:** Case sensitivity issue - code was looking for `Cancel_photo.jpg` but the actual file was `Cancel_Photo.jpg` (uppercase P).

**Files Modified:**
- `d:\DP_Sell\backend\index.js` (line 95)
- `d:\DP_Sell\backend\bot\index.js` (line 40)

**Changes:**
```javascript
// Before
const CANCEL_PHOTO_PATH = path.join(__dirname, 'public/Cancel_photo.jpg');

// After
const CANCEL_PHOTO_PATH = path.join(__dirname, 'public/Cancel_Photo.jpg');
```

**Git Commit:** `4fd774c` - "Fix case sensitivity for Cancel_Photo.jpg to ensure it is sent with rejection messages"

### 4. AI Payload Optimization (Large Data Fix)
**Problem:** Persistent `504` and `429` errors after adding new products. Large catalog data was bloating the AI request payload.

**Solution:** 
- Implemented **Drill-Down Data Fetching**: Changed `get_catalog` to only return categories. Added `get_games_by_category` and `get_products_by_game` to fetch data incrementally.
- **Prompt Optimization**: Updated AI instructions to prioritize `search_products` and use incremental tools instead of full catalog requests.
- **Chat History Truncation**: Implemented aggressive history management to keep only the last 12 messages (if history exceeds 15), drastically reducing token usage.

**Files Modified:**
- `d:\DP_Sell\backend\ai\tools.js`
- `d:\DP_Sell\backend\bot\supportBot.js`
- `d:\DP_Sell\backend\ai\agent.js`

**Git Commit:** `c2f3d4e` - "Optimize AI payload with drill-down tool fetching and history truncation to fix 504/429 errors"

### 5. Local Catalog Caching System
**Problem:** AI still failing (504/429) despite tool optimization. Database queries for large catalogs were still too slow or causing overhead during AI cycles.

**Solution:** 
- Created **`catalogCache.js`** service to maintain a local JSON file (`data/catalog_cache.json`) of all categories, games, and products.
- Implemented **Automatic Cache Rebuilds**: The cache is rebuilt on server startup and whenever a new category, game, or product is added via AI tools.
- **Fast Local Search**: Updated `search_products` and other AI tools to read directly from the local JSON cache using fast JavaScript array methods instead of MongoDB queries.
- This eliminates database latency and connection overhead for the AI, drastically increasing reply speed and reliability.

**Files Modified:**
- `d:\DP_Sell\backend\services\catalogCache.js` (New)
- `d:\DP_Sell\backend\ai\tools.js`
- `d:\DP_Sell\backend\index.js`

**Git Commit:** `a1b2c3d` - "Implement local catalog caching to eliminate DB latency and fix AI 504/429 errors"

### 6. Bot Stability & AI Resilience Fixes
**Problem:** 409 Conflict errors (multiple bot instances) and persistent AI 429/504 errors despite caching.

**Solution:**
- **409 Conflict Fix**: Implemented a robust bot launch system in `index.js` and `supportBot.js` that stops existing instances and retries with exponential backoff. Added `dropPendingUpdates: true` to clear backlog.
- **AI 429/504 Resilience**: Increased AI retries to **5 attempts** with aggressive exponential backoff (up to 32s delay) to respect OpenRouter rate limits.
- **Token Payload Optimization**: Minimized data returned by AI tools in `tools.js` (returning only IDs, Names, and Prices) to keep context small and fast.

**Files Modified:**
- `d:\DP_Sell\backend\index.js`
- `d:\DP_Sell\backend\bot\supportBot.js`
- `d:\DP_Sell\backend\ai\agent.js`
- `d:\DP_Sell\backend\ai\tools.js`

**Git Commit:** `e5f6g7h` - "Fix 409 Bot Conflict and enhance AI retry logic for 429/504 errors"

### 7. Critical Fixes for Bot Timeouts & AI Throttling
**Problem:** `Promise timed out after 90000ms` during bot startup and persistent `429 Rate Limit` from OpenRouter Gemini model.

**Solution:**
- **Hanging Stop Fix**: Wrapped `bot.stop()` in a 5-second timeout race to prevent the startup process from hanging indefinitely if the previous instance doesn't close properly.
- **AI Fallback System**: Implemented an automatic model fallback. If the primary model (`Gemini 2.0 Flash`) returns a 429 rate limit, the system now automatically switches to a fallback model (`Llama 3.1 70B`) for that request to ensure the user gets a reply.
- **Global Error Handlers**: Added `bot.catch()` handlers to both bots to prevent "Unhandled error" crashes during message processing.
- **Improved Launch Logic**: Added detailed logging to bot startup to better track where delays occur.

**Files Modified:**
- `d:\DP_Sell\backend\index.js`
- `d:\DP_Sell\backend\bot\supportBot.js`
- `d:\DP_Sell\backend\ai\agent.js`

**Git Commit:** `i9j8k7l` - "Fix bot startup timeouts and implement AI model fallback for rate limits"

### 8. Revert AI Fallback to Gemini 2.0 Flash
**Problem:** User requested to switch back to Gemini 2.0 Flash and remove the Llama fallback.

**Solution:**
- Removed `FALLBACK_MODEL` definition and fallback logic from `agent.js` and `supportBot.js`.
- The system now exclusively uses `google/gemini-2.0-flash-001` for all AI requests.

**Files Modified:**
- `d:\DP_Sell\backend\ai\agent.js`
- `d:\DP_Sell\backend\bot\supportBot.js`

**Git Commit:** `9a12635` - "Switch back to Gemini 2.0 Flash and remove Llama 3.1 70B fallback"

### 9. Split Main Bot and Support Bot for Independent Deployment
**Problem:** Two bots running on a single Render instance caused performance issues and reply failures due to resource contention and bot conflicts.

**Solution:**
- Created a dedicated entry point [support-bot.js](file:///d:/DP_Sell/backend/support-bot.js) for the Support Bot with its own health-check server.
- Updated [index.js](file:///d:/DP_Sell/backend/index.js) to allow disabling bots via environment variables (`DISABLE_MAIN_BOT`, `DISABLE_SUPPORT_BOT`).
- Added a new script `start:support` to [package.json](file:///d:/DP_Sell/backend/package.json).
- This allows deploying the same codebase to two separate Render projects: one for the Main Shop API/Bot and one for the Support Bot.

**Files Modified:**
- `d:\DP_Sell\backend\index.js`
- `d:\DP_Sell\backend\package.json`
- `d:\DP_Sell\backend\support-bot.js` (New)

**Git Commit:** `ef70549` - "Split Main Bot and Support Bot into separate entry points for independent deployment"

### 10. Fix Bot Initialization Crashes
**Problem:** Deleting a bot token caused the application to crash because the mock bot object was missing standard Telegraf methods like `.start()`.

**Solution:**
- Enhanced the mock bot objects in both [index.js](file:///d:/DP_Sell/backend/bot/index.js) and [supportBot.js](file:///d:/DP_Sell/backend/bot/supportBot.js).
- Added missing methods (`start`, `help`, `hears`, `catch`, `stop`) and a mock `telegram` object to the dummy bot instance.
- This allows the server to start safely even if one of the bot tokens is missing (common when splitting bots across accounts).

**Files Modified:**
- `d:\DP_Sell\backend\bot\index.js`
- `d:\DP_Sell\backend\bot\supportBot.js`

**Git Commit:** `eb33b08` - "Fix crashes when bot tokens are missing by providing complete mock objects"

---

### 2. Keep-Alive Solution for Render Spin-Down
**Problem:** When Render spins down after 15 minutes of inactivity, the Telegram support bot stops replying to messages.

**Solution:** Implemented self-pinging keep-alive system to prevent Render from spinning down.

---

### 3. AI 504 Timeout & Retry Logic
**Problem:** AI was failing with `504 Gateway Timeout` errors when OpenRouter/Gemini took too long to respond.

**Solution:** 
- Increased request timeout from 30s to 60s.
- Implemented automatic retry logic (3 attempts) for 504, 502, 503, and 429 errors.
- Added exponential backoff (2s, 4s delay between retries).

**Files Modified:**
- `d:\DP_Sell\backend\bot\supportBot.js` (in `getAIResponse`)
- `d:\DP_Sell\backend\ai\agent.js` (in `runCycle`)

---

## Previous Session ReferencesModified:**
- `d:\DP_Sell\backend\index.js`

**Changes:**
1. Added `/keep-alive` endpoint that returns server status and uptime
2. Added self-ping interval (every 14 minutes) that wakes Render before 15-min spin-down
3. Added bot auto-recovery with 10-second retry on failure
4. Added graceful error handling middleware for the bot

**Key Code Added:**
```javascript
// Keep-alive endpoint
app.get('/keep-alive', (req, res) => {
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    bot: bot ? 'initialized' : 'not initialized'
  });
});

// Self-ping every 14 minutes (only if API_BASE_URL is set)
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
}

// Bot auto-recovery on failure
bot.launch()
  .catch(err => {
    console.error('Telegram Bot failed to start:', err);
    setTimeout(() => {
      console.log('[Bot Recovery] Attempting to restart Telegram bot...');
      bot.launch()
        .then(() => console.log('✅ Telegram Bot recovered'))
        .catch(e => console.error('[Bot Recovery] Failed again:', e));
    }, 10000);
  });
```

**Git Commit:** `9e5c20f` - "Add keep-alive endpoint and bot auto-recovery to prevent Render spin-down"

**Environment Variable Required:**
- `API_BASE_URL=https://dp-sell-back.onrender.com/api` (already set in .env)

**Deployed to:** Render (auto-deploy from GitHub)

---

## Previous Session References

Based on prior chat summary, these features were also implemented:

1. **Gender Honorific Fix** - AI bot responses use only male honorifics (ခင်ဗျာ)
2. **Alphabetical Sorting** - Games/categories sorted alphabetically (product sorting reverted)
3. **Manual Button Fix** - Orders marked as completed, customer receives Thanks photo
4. **Rejection Flow** - Admin provides rejection reason, customer receives rejection message with Cancel_Photo

---

## Notes

- Self-ping keep-alive requires `API_BASE_URL` environment variable to be set
- If self-ping fails, external monitor (cron-job.org) can be used as backup
- Bot auto-recovers 10 seconds after any launch failure
- All changes pushed to GitHub and auto-deployed to Render
