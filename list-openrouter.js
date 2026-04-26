const axios = require('axios');
require('dotenv').config();

async function listOpenRouterModels() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const url = "https://openrouter.ai/api/v1/models";
  
  try {
    console.log('Listing OpenRouter models...');
    const response = await axios.get(url, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const geminiModels = response.data.data.filter(m => m.id.toLowerCase().includes('gemini'));
    console.log('✅ Gemini models available on OpenRouter:', geminiModels.map(m => m.id).join(', '));
  } catch (err) {
    console.log('❌ Failed to list OpenRouter models:', err.message);
  }
}

listOpenRouterModels();
