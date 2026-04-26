
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const Game = require('../models/Game');
const Product = require('../models/Product');
const Category = require('../models/Category');

const SELLER_ID = '741844';
const MONGODB_URI = process.env.MONGODB_URI;

// Helper to round price to nearest 100
function roundPrice(price) {
    return Math.round(price / 100) * 100;
}

// Helper to get random number between 1 and 10
function getRandomSoldCount() {
    return Math.floor(Math.random() * 10) + 1;
}

async function importSellerDealerProducts() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        // 1. Ensure categories exist
        const categories = {
            'Top-Up': 'top-up',
            'Steam': 'digital-product',
            'Epic Game': 'digital-product',
            'Gift Card': 'digital-product'
        };

        const categoryMap = {};
        for (const [name, type] of Object.entries(categories)) {
            let cat = await Category.findOne({ name });
            if (!cat) {
                console.log(`Creating ${name} category...`);
                cat = await Category.create({ name, type, isActive: true });
            }
            categoryMap[name] = cat._id;
        }

        // 2. Fetch all products from Plati XML API for seller 741844
        // Using lang=en-US to get English names and descriptions
        let page = 1;
        let totalPages = 1;
        let importedCount = 0;
        const products = [];

        // Helper to clean Russian text
        function cleanText(text) {
            if (!text) return '';
            
            // 1. Remove actual Cyrillic characters
            let cleaned = text.replace(/[а-яА-ЯёЁ]/g, '');
            
            // 2. Remove broken UTF-8 Russian characters and other non-ASCII garbage
            // This regex targets the "╨í╨£╨ò..." style mis-encoding
            cleaned = cleaned.replace(/[╨╤╒╓╫╪┘┌█▄▌▐▀][\u0080-\u00BF\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2000-\u206F]/g, '');
            cleaned = cleaned.replace(/[╨╤╒╓╫╪┘┌█▄▌▐▀]/g, '');
            
            // 3. Remove other non-ASCII characters that are not common emojis/symbols
            // We'll keep common emojis used on Plati (like stars, fire, etc.)
            // But remove anything that looks like Russian remnants
            cleaned = cleaned.replace(/[^\x00-\x7F\u2100-\u2BFF\u2600-\u27BF]/g, '');
            
            // Remove multiple spaces and trim
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            
            // Remove trailing/leading decorative symbols that might be left alone
            cleaned = cleaned.replace(/^[^\w\s]+|[^\w\s]+$/g, '').trim();
            
            return cleaned;
        }

        do {
            console.log(`Fetching page ${page}...`);
            const url = `https://shop.digiseller.ru/xml/shop_products.asp?seller_id=${SELLER_ID}&rows=100&page=${page}&lang=en-US`;
            const response = await axios.get(url);
            const $ = cheerio.load(response.data, { xmlMode: true });

            if (page === 1) {
                totalPages = parseInt($('pages').text()) || 1;
                console.log(`Total pages to fetch: ${totalPages}`);
            }

            const pageProducts = $('product');
            if (pageProducts.length === 0) break;

            pageProducts.each((i, el) => {
                const p = $(el);
                const rawName = p.find('name').text();
                const rawDesc = p.find('info').text();
                
                const cleanName = cleanText(rawName);
                const cleanDesc = cleanText(rawDesc);

                // Skip if name is empty after cleaning
                if (!cleanName || cleanName.length < 3) return;

                products.push({
                    id: p.find('id').text(),
                    name: cleanName,
                    price_usd: parseFloat(p.find('price_usd').text()),
                    description: cleanDesc,
                    icon: `https://graph.digiseller.ru/img.ashx?id_d=${p.find('id').text()}&w=200&h=200`
                });
            });

            page++;
        } while (page <= totalPages);

        console.log(`Found ${products.length} cleaned English products to process.`);

        for (const p of products) {
            try {
                // Determine category based on name/description keywords
                let targetCategory = 'Steam'; // Default
                const nameLower = p.name.toLowerCase();
                const descLower = p.description.toLowerCase();

                if (nameLower.includes('top up') || nameLower.includes('topup') || nameLower.includes('refill') || nameLower.includes('mobile-legend') || nameLower.includes('pubg')) {
                    targetCategory = 'Top-Up';
                } else if (nameLower.includes('gift card') || nameLower.includes('itunes') || nameLower.includes('google play') || nameLower.includes('psn') || nameLower.includes('gift-card')) {
                    targetCategory = 'Gift Card';
                } else if (nameLower.includes('epic game') || nameLower.includes('epic') || descLower.includes('epic games store') || descLower.includes('epic games')) {
                    targetCategory = 'Epic Game';
                } else {
                    targetCategory = 'Steam'; // Fallback for games
                }

                const categoryId = categoryMap[targetCategory];

                // Convert price: USD * 4500 + 5000 and round to nearest 100
                const rawPrice = p.price_usd * 4500 + 5000;
                const priceMMK = roundPrice(rawPrice);
                const platiUrl = `https://plati.market/itm/${p.id}`;

                // Check if game already exists
                let game = await Game.findOne({ name: p.name });
                if (!game) {
                    game = new Game({
                        name: p.name,
                        categoryId: categoryId,
                        icon: p.icon,
                        description: p.description,
                        isActive: true,
                        platiUrls: [platiUrl],
                        soldCount: getRandomSoldCount()
                    });

                    // Add requirements if it's a game (Steam/Epic)
                    if (targetCategory === 'Steam' || targetCategory === 'Epic Game') {
                        game.systemRequirements = {
                            os: 'Windows 10/11 64-bit',
                            processor: 'Intel Core i5 / AMD Ryzen 5',
                            memory: '8 GB RAM',
                            graphics: 'NVIDIA GTX 1050 / AMD RX 560',
                            storage: '50 GB available space'
                        };
                    }
                    await game.save();
                } else {
                    // Update existing
                    game.description = p.description;
                    game.icon = p.icon;
                    game.categoryId = categoryId;
                    if (!game.platiUrls.includes(platiUrl)) {
                        game.platiUrls.push(platiUrl);
                    }
                    await game.save();
                }

                // Create/Update Product
                let product = await Product.findOne({ gameId: game._id, name: p.name });
                if (!product) {
                    product = new Product({
                        gameId: game._id,
                        name: p.name,
                        price: priceMMK,
                        icon: p.icon,
                        isActive: true,
                        isDigital: true,
                        platiUrls: [platiUrl]
                    });
                    await product.save();
                } else {
                    product.price = priceMMK;
                    product.icon = p.icon;
                    if (!product.platiUrls.includes(platiUrl)) {
                        product.platiUrls.push(platiUrl);
                    }
                    await product.save();
                }

                importedCount++;
                if (importedCount % 10 === 0) {
                    console.log(`Imported/Updated ${importedCount} items...`);
                }
            } catch (err) {
                console.error(`Error processing product ${p.id}: ${err.message}`);
            }
        }

        console.log(`Successfully finished. Total items processed: ${importedCount}`);
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

importSellerDealerProducts();
