const axios = require('axios');
require('dotenv').config();

async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const url = "https://openrouter.ai/api/v1/chat/completions";
  
  const modelsToTry = [
    "google/gemini-flash-1.5",
    "google/gemini-pro-1.5",
    "google/gemini-flash-1.5-8b",
    "meta-llama/llama-3.1-8b-instruct:free"
  ];

  console.log('Testing OpenRouter with API Key:', apiKey.substring(0, 10) + '...');

  for (const model of modelsToTry) {
    try {
      console.log(`Testing model: ${model}...`);
      const response = await axios.post(
        url,
        {
          model: model,
          messages: [{ role: "user", content: "Say hi in Myanmar language" }]
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log(`✅ ${model} works! Response: ${response.data.choices[0].message.content}`);
      return model;
    } catch (err) {
      console.log(`❌ ${model} failed: ${err.response ? JSON.stringify(err.response.data) : err.message}`);
    }
  }
}

testOpenRouter();
