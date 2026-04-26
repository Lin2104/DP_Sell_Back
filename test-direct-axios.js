const axios = require('axios');
require('dotenv').config();

async function testDirectGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  // Testing with the model name from the user's curl: gemini-flash-latest
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  
  try {
    console.log('Testing direct Gemini with axios...');
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: 'Say hi in Myanmar language' }] }]
    });
    console.log('✅ Success!', response.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.log('❌ Direct Gemini failed:', err.response ? err.response.status : err.message);
    if (err.response && err.response.data) {
      console.log('Error details:', JSON.stringify(err.response.data));
    }
  }
}

testDirectGemini();
