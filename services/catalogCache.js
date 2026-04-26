const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const Category = require('../models/Category');
const Game = require('../models/Game');
const Product = require('../models/Product');

const CACHE_FILE = path.join(__dirname, '../data/catalog_cache.json');
const DATA_DIR = path.join(__dirname, '../data');

let isRebuilding = false;

/**
 * Rebuilds the catalog cache file by fetching all data from the database.
 */
async function rebuildCatalogCache() {
  if (isRebuilding) {
    console.log('[CatalogCache] Cache rebuild already in progress, skipping...');
    return;
  }
  
  isRebuilding = true;
  try {
    console.log('[CatalogCache] Rebuilding cache...');
    
    if (!fsSync.existsSync(DATA_DIR)) {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }

    const categories = await Category.find({}, { name: 1, type: 1, _id: 1 }).sort({ name: 1 }).lean();
    const games = await Game.find({}, { name: 1, categoryId: 1, _id: 1, description: 1, icon: 1 }).sort({ name: 1 }).lean();
    const products = await Product.find({ isActive: true }, { name: 1, price: 1, gameId: 1, _id: 1, description: 1, isDigital: 1, icon: 1 }).sort({ price: 1 }).lean();

    const cacheData = {
      lastUpdated: new Date().toISOString(),
      categories,
      games,
      products
    };

    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`[CatalogCache] Cache rebuilt successfully at ${cacheData.lastUpdated}`);
    return cacheData;
  } catch (err) {
    console.error('[CatalogCache] Error rebuilding cache:', err);
    throw err;
  } finally {
    isRebuilding = false;
  }
}

/**
 * Returns the cached catalog data. If the cache doesn't exist, it rebuilds it.
 */
async function getCachedCatalog() {
  try {
    if (!fsSync.existsSync(CACHE_FILE)) {
      return await rebuildCatalogCache();
    }
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[CatalogCache] Error reading cache:', err);
    return await rebuildCatalogCache();
  }
}

module.exports = {
  rebuildCatalogCache,
  getCachedCatalog
};
