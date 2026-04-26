const axios = require('axios');
const cheerio = require('cheerio');
const Game = require('../../models/Game');
const Product = require('../../models/Product');
const Order = require('../../models/Order');

const STOCK_CHECK_INTERVAL = 10 * 60 * 1000; // 10 minutes

class PlatiStockMonitor {
    constructor() {
        this.bot = null;
        this.lastStockStatus = new Map();
    }

    setBot(botInstance) {
        this.bot = botInstance;
    }

    async checkStockForGame(game) {
        if (!game.platiUrls || game.platiUrls.length === 0) {
            return { gameId: game._id, gameName: game.name, hasUrls: false };
        }

        let inStock = false;
        let availableUrl = null;
        let allChecked = 0;

        try {
            for (const url of game.platiUrls) {
                allChecked++;
                const result = await this.checkSingleUrl(url);
                if (result.inStock) {
                    inStock = true;
                    availableUrl = url;
                    break;
                }
            }

            const status = {
                gameId: game._id.toString(),
                gameName: game.name,
                inStock,
                availableUrl,
                totalUrls: game.platiUrls.length,
                checkedUrls: allChecked,
                checkedAt: new Date()
            };

            // Check if status changed (went out of stock)
            const prevStatus = this.lastStockStatus.get(game._id.toString());
            if (prevStatus?.inStock && !inStock) {
                await this.alertStockOut(game);
            }

            this.lastStockStatus.set(game._id.toString(), status);
            return status;
        } catch (err) {
            console.error(`[PlatiStockMonitor] Error checking stock for ${game.name}:`, err.message);
            return { gameId: game._id, gameName: game.name, error: err.message };
        }
    }

    async checkSingleUrl(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 15000
            });

            const $ = cheerio.load(response.data);
            
            // Plati usually has specific markers for out of stock
            const outOfStockText = $('body').text().toLowerCase();
            const hasOutOfStockKeywords = 
                outOfStockText.includes('товар закончился') || // Russian for "product ended"
                outOfStockText.includes('out of stock') ||
                outOfStockText.includes('sold out') ||
                outOfStockText.includes('not available');

            // Look for the "Buy" button (usually has 'buy' in class or text)
            const hasBuyButton = 
                $('.btn-buy').length > 0 || 
                $('button:contains("Buy")').length > 0 || 
                $('a:contains("Buy")').length > 0 ||
                $('.payment-form').length > 0;

            return { 
                inStock: !hasOutOfStockKeywords && hasBuyButton, 
                url 
            };
        } catch (err) {
            console.error(`[PlatiStockMonitor] Axios error for ${url}:`, err.message);
            return { inStock: false, url, error: true };
        }
    }

    async checkAllGamesStock() {
        console.log('[PlatiStockMonitor] Checking stock for all games...');
        const games = await Game.find({ platiUrls: { $exists: true, $ne: [] } });
        const results = [];

        for (const game of games) {
            const result = await this.checkStockForGame(game);
            results.push(result);
            // Small delay between checks to avoid rate limiting
            await new Promise(r => setTimeout(r, 2000));
        }

        console.log(`[PlatiStockMonitor] Checked ${results.length} games. ${results.filter(r => r.inStock).length} in stock.`);
        return results;
    }

    async alertStockOut(game) {
        if (!this.bot || !process.env.ADMIN_CHAT_ID) return;

        try {
            await this.bot.telegram.sendMessage(
                process.env.ADMIN_CHAT_ID,
                `⚠️ <b>Stock Alert!</b>\n\n` +
                `Game "<b>${game.name}</b>" is now OUT OF STOCK on Plati.market!\n\n` +
                `Orders for this game will fail until stock is restored.`,
                { parse_mode: 'HTML' }
            );
        } catch (err) {
            console.error('[PlatiStockMonitor] Failed to alert admin:', err.message);
        }
    }

    async blockOrdersIfOutOfStock(gameId) {
        const status = this.lastStockStatus.get(gameId.toString());
        return !status?.inStock;
    }

    startMonitoring(intervalMinutes = 10) {
        console.log(`[PlatiStockMonitor] Starting stock monitoring (every ${intervalMinutes} minutes)`);

        // Initial check
        setTimeout(() => this.checkAllGamesStock(), 5000);

        // Periodic check
        const interval = setInterval(() => {
            this.checkAllGamesStock();
        }, intervalMinutes * 60 * 1000);

        return () => clearInterval(interval);
    }

    getStockStatus(gameId) {
        return this.lastStockStatus.get(gameId.toString());
    }

    async getStockStatusForProduct(productId) {
        const product = await Product.findById(productId).populate('gameId');
        if (!product || !product.gameId) return null;

        const gameId = typeof product.gameId === 'object' ? product.gameId._id : product.gameId;
        return this.lastStockStatus.get(gameId.toString());
    }
}

module.exports = new PlatiStockMonitor();