const mongoose = require('mongoose');
require('dotenv').config();

const Game = require('../models/Game');
const Product = require('../models/Product');
const Category = require('../models/Category');

const MONGODB_URI = process.env.MONGODB_URI;

async function deduplicateAndFixDescriptions() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected successfully.');

        const categories = await Category.find();
        console.log(`Processing ${categories.length} categories...`);

        for (const category of categories) {
            const games = await Game.find({ categoryId: category._id }).sort({ soldCount: -1 });
            
            if (games.length > 1) {
                console.log(`Category "${category.name}" has ${games.length} games. Keeping only one...`);
                
                // Keep the one with highest soldCount (already sorted)
                const keepGame = games[0];
                const gamesToDelete = games.slice(1);
                const gameIdsToDelete = gamesToDelete.map(g => g._id);

                // 1. Delete products associated with the games to be deleted
                const productDeleteResult = await Product.deleteMany({ gameId: { $in: gameIdsToDelete } });
                console.log(`Deleted ${productDeleteResult.deletedCount} products for category "${category.name}".`);

                // 2. Delete the games
                const gameDeleteResult = await Game.deleteMany({ _id: { $in: gameIdsToDelete } });
                console.log(`Deleted ${gameDeleteResult.deletedCount} duplicate games for category "${category.name}".`);

                // 3. Update the kept game's description and name
                await fixGame(keepGame, category.name);
            } else if (games.length === 1) {
                console.log(`Category "${category.name}" has 1 game. Fixing its description...`);
                await fixGame(games[0], category.name);
            } else {
                console.log(`Category "${category.name}" has no games.`);
            }
        }

        console.log('Successfully finished deduplication and cleanup.');
        process.exit(0);
    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

async function fixGame(game, categoryName) {
    // Standardize name based on category
    let newName = game.name;
    let newDesc = "";

    if (categoryName === 'Top-Up') {
        newName = "Mobile Legends: Bang Bang Diamonds Top-Up";
        newDesc = "Instant and reliable diamonds top-up for Mobile Legends: Bang Bang. Enhance your gaming experience with new skins, heroes, and emotes. Fast delivery, 100% secure, and 24/7 support. Simply provide your User ID and Zone ID to receive your diamonds immediately.";
    } else if (categoryName === 'Steam') {
        newName = "Steam Digital Wallet & Games Collection";
        newDesc = "Get access to the world's largest gaming platform with our Steam Digital Wallet and Game collection. Enjoy thousands of titles, from AAA blockbusters to indie favorites. Instant activation, secure delivery, and the best prices for your Steam account. Start playing your favorite games today!";
    } else if (categoryName === 'Epic Game') {
        newName = "Epic Games Store Digital Content";
        newDesc = "Unlock exclusive titles and amazing deals on the Epic Games Store. From Fortnite V-Bucks to the latest exclusive releases, we provide safe and fast digital content delivery. Experience high-quality gaming with Epic Games Store's unique library of titles.";
    } else if (categoryName === 'Gift Card' || categoryName === 'Gift Cards') {
        newName = "Universal Digital Gift Cards";
        newDesc = "Premium digital gift cards for all your favorite platforms including iTunes, Google Play, PlayStation, and more. Perfect for personal use or as a gift. Receive your digital code instantly and redeem it on your preferred store for games, movies, apps, and subscriptions.";
    } else {
        // Generic fix for other categories like VPN, Editing etc.
        newName = `${categoryName} Premium Services`;
        newDesc = `Get high-quality ${categoryName} services at the best prices. We provide fast activation, secure access, and 24/7 support for all your digital needs. Enjoy premium features and reliable performance with our ${categoryName} solutions.`;
    }

    game.name = newName;
    game.description = newDesc;
    
    // Also fix any remaining messy fields
    game.benefits = [
        "Instant delivery to your account",
        "100% Secure and guaranteed service",
        "Competitive prices with no hidden fees",
        "Dedicated 24/7 customer support"
    ];
    game.purchaseInfo = [
        "Select your desired amount or game",
        "Provide the necessary account details",
        "Complete the payment securely",
        "Receive your product instantly"
    ];

    await game.save();
    
    // Also update the associated product names to match the new game name
    await Product.updateMany({ gameId: game._id }, { name: newName });
    
    console.log(`Updated game and products for: ${categoryName}`);
}

deduplicateAndFixDescriptions();
