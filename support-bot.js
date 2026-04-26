require('dotenv').config();
const mongoose = require('mongoose');
const { launchSupportBot } = require('./bot/supportBot');
const { rebuildCatalogCache } = require('./services/catalogCache');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 5001;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ Support Bot connected to MongoDB');
    
    // Build catalog cache for AI tools
    try {
      await rebuildCatalogCache();
      console.log('✅ Catalog cache rebuilt for Support Bot');
    } catch (err) {
      console.error('Failed to build catalog cache:', err.message);
    }

    // Launch Support Bot
    if (process.env.SUPPORT_BOT_TOKEN) {
      launchSupportBot();
    } else {
      console.error('❌ SUPPORT_BOT_TOKEN missing!');
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// Health check for Render
app.get('/health', (req, res) => res.status(200).send('Support Bot is running'));
app.get('/', (req, res) => res.status(200).send('Support Bot Entry Point'));

app.listen(PORT, () => {
  console.log(`Support Bot health-check server running on port ${PORT}`);
});
