
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const Game = require('../models/Game');
const Product = require('../models/Product');
const Category = require('../models/Category');

const SELLER_ID = '718240';
const MONGODB_URI = process.env.MONGODB_URI;

async function importProducts() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        // 1. Ensure "Steam" category exists
        let category = await Category.findOne({ name: 'Steam' });
        if (!category) {
            console.log('Creating Steam category...');
            category = await Category.create({
                name: 'Steam',
                type: 'digital-product',
                isActive: true
            });
        }
        const categoryId = category._id;

        // 2. Fetch test products from Plati XML API
        console.log(`Fetching test products (limit 5)...`);
        const url = `https://shop.digiseller.ru/xml/shop_products.asp?seller_id=${SELLER_ID}&rows=5`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data, { xmlMode: true });

        const products = [];
        $('product').each((i, el) => {
            const p = $(el);
            products.push({
                id: p.find('id').text(),
                name: p.find('name').text(),
                price_usd: parseFloat(p.find('price_usd').text()),
                description: p.find('info').text(),
                icon: `https://graph.digiseller.ru/img.ashx?id_d=${p.find('id').text()}&w=200&h=200`
            });
        });

        console.log(`Found ${products.length} products to import.`);

        let importedCount = 0;
        for (const p of products) {
                try {
                    // Convert price: USD * 4500 + 5000
                    const priceMMK = Math.ceil(p.price_usd * 4500 + 5000);
                    const platiUrl = `https://plati.market/itm/${p.id}`;

                    // Check if game already exists by name
                    let game = await Game.findOne({ name: p.name });
                    if (!game) {
                        game = new Game({
                            name: p.name,
                            categoryId: categoryId,
                            icon: p.icon,
                            description: p.description,
                            isActive: true,
                            platiUrls: [platiUrl]
                        });
                        await game.save();
                    } else {
                        // Update existing game
                        game.description = p.description;
                        game.icon = p.icon;
                        if (!game.platiUrls.includes(platiUrl)) {
                            game.platiUrls.push(platiUrl);
                        }
                        await game.save();
                    }

                    // Check if product already exists for this game
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
                        // Update price and icon
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
            console.error(`Error importing product ${p.id}: ${err.message}`);
        }
    }

    console.log(`Successfully finished. Total items processed: ${importedCount}`);
    process.exit(0);
} catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

importProducts();
