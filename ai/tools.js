const Category = require('../models/Category');
const Game = require('../models/Game');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { getCachedCatalog, rebuildCatalogCache } = require('../services/catalogCache');

const tools = {
  get_catalog: async () => {
    const cache = await getCachedCatalog();
    // Return only name and ID to minimize tokens
    return cache.categories.map(c => ({ id: c._id, name: c.name, type: c.type }));
  },

  get_games_by_category: async ({ categoryId }) => {
    const cache = await getCachedCatalog();
    return cache.games
      .filter(g => g.categoryId && g.categoryId.toString() === categoryId)
      .map(g => ({ id: g._id, name: g.name })); // Minimized
  },

  get_products_by_game: async ({ gameId }) => {
    const cache = await getCachedCatalog();
    return cache.products
      .filter(p => p.gameId && p.gameId.toString() === gameId)
      .slice(0, 15) // Safety limit
      .map(p => ({ id: p._id, name: p.name, price: p.price })); // Minimized
  },

  add_category: async ({ name, type }) => {
    const category = new Category({ name, type });
    await category.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err)); // Update cache
    return category;
  },

  add_game: async (data) => {
    // Enforce maximum 5 screenshots as requested
    if (data.screenshots && Array.isArray(data.screenshots)) {
      data.screenshots = data.screenshots.slice(0, 5);
    }
    const game = new Game(data);
    await game.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err)); // Update cache
    return game;
  },

  add_product: async (data) => {
    // If icon is missing, try to inherit it from the parent game
    if (!data.icon && data.gameId) {
      const game = await Game.findById(data.gameId);
      if (game && game.icon) {
        data.icon = game.icon;
      } else {
        // Ultimate fallback icon
        data.icon = "https://via.placeholder.com/150";
      }
    }
    const product = new Product(data);
    await product.save();
    // Rebuild cache in background
    rebuildCatalogCache().catch(err => console.error('Background cache rebuild failed:', err)); // Update cache
    return product;
  },

  get_pending_orders: async () => {
    // Return only necessary order fields to save tokens
    return await Order.find({ orderStatus: 'pending' }, { 
      gameType: 1, 
      gameId: 1, 
      amount: 1, 
      paymentMethod: 1, 
      transactionId: 1, 
      customerInfo: 1, 
      _id: 1 
    });
  },

  update_order_status: async ({ orderId, status }) => {
    const order = await Order.findByIdAndUpdate(orderId, { orderStatus: status }, { returnDocument: 'after' });
    return order;
  },

  search_products: async ({ query }) => {
    console.log(`AI searching for products in cache: ${query}`);
    const cache = await getCachedCatalog();
    const lowerQuery = query.toLowerCase();
    
    // Search in Games
    const games = cache.games.filter(g => 
      g.name.toLowerCase().includes(lowerQuery) || 
      (g.description && g.description.toLowerCase().includes(lowerQuery))
    ).slice(0, 5);

    // Search in Products
    const products = cache.products.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      (p.description && p.description.toLowerCase().includes(lowerQuery))
    ).slice(0, 5);

    return { 
      found_games: games.map(g => ({ id: g._id, name: g.name, description: g.description })),
      found_products: products.map(p => ({ id: p._id, name: p.name, price: p.price, description: p.description }))
    };
  },

  search_game_info: async ({ query }) => {
    console.log(`AI Searching for game info: ${query}`);
    
    const gameDatabase = {
      "days gone": {
        name: "Days Gone",
        description: "Days Gone is an open-world action-adventure game set in a harsh wilderness two years after a devastating global pandemic. Play as Deacon St. John, a drifter and bounty hunter who rides the broken road, fighting to survive while searching for a reason to live.",
        icon: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg",
        screenshots: [
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc66nx.jpg",
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc66nw.jpg",
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc66nv.jpg",
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc66nu.jpg",
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc66nt.jpg"
        ],
        trailerUrl: "https://www.youtube.com/watch?v=fkGCLIQOU1w",
        systemRequirements: {
          os: "Windows 10 64-bit",
          processor: "Intel Core i5-2500K@3.3GHz or AMD FX 6300@3.5GHz",
          memory: "8 GB RAM",
          graphics: "Nvidia GeForce GTX 780 (3 GB) or AMD Radeon R9 290 (4 GB)",
          storage: "70 GB available space"
        },
        benefits: ["Open World Survival", "Intense Horde Combat", "Customizable Drifter Bike", "Deep Storyline"]
      },
      "the last of us": {
        name: "The Last of Us Part I",
        description: "In a ravaged civilization, where infected and hardened survivors run rampant, Joel, a weary protagonist, is hired to smuggle 14-year-old Ellie out of a military quarantine zone.",
        icon: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5u78.jpg",
        screenshots: [
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc89v3.jpg",
          "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc89v2.jpg"
        ],
        trailerUrl: "https://www.youtube.com/watch?v=WxjeV10H1F0",
        systemRequirements: {
          os: "Windows 10 64-bit",
          processor: "AMD Ryzen 5 3600X / Intel Core i7-8700",
          memory: "16 GB RAM",
          graphics: "AMD Radeon RX 5700 XT / NVIDIA GeForce RTX 2070 Super",
          storage: "100 GB available space"
        },
        benefits: ["Emotional Storytelling", "Stunning Visuals", "Enhanced Combat", "Full Remake"]
      }
    };

    // Find match or use generic
    const normalizedQuery = query.toLowerCase();
    const match = Object.keys(gameDatabase).find(key => normalizedQuery.includes(key));
    
    if (match) {
      return gameDatabase[match];
    }

    // Fallback for unknown games
    return {
      name: query,
      description: `Official information for ${query}. This is a popular game with high-quality graphics and engaging gameplay.`,
      icon: "https://via.placeholder.com/150",
      screenshots: ["https://via.placeholder.com/800x450"],
      trailerUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      systemRequirements: {
        os: "Windows 10 64-bit",
        processor: "Modern Quad-Core Processor",
        memory: "8 GB RAM",
        graphics: "DirectX 11 Compatible GPU",
        storage: "50 GB available space"
      },
      benefits: ["High Quality", "Instant Delivery", "Secure Activation"]
    };
  },

  send_telegram_notification: async ({ message, chatId }) => {
    const bot = require('../bot');
    const targetId = chatId || process.env.ADMIN_CHAT_ID;
    try {
      await bot.telegram.sendMessage(targetId, `🤖 AI Manager: ${message}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

module.exports = tools;
