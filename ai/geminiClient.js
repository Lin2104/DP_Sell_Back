const axios = require('axios');

// Google Gemini API (OpenAI-compatible endpoint)
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/**
 * Optional proxy for Gemini requests.
 * Gemini blocks some regions (e.g. Myanmar) with "User location is not supported",
 * so requests can be routed through a proxy located in a supported country.
 *
 * GEMINI_PROXY_URL formats:
 *   http://host:port
 *   http://user:pass@host:port
 *   socks5://user:pass@host:port
 * Leave empty to connect directly (e.g. when deployed on Render).
 */
function buildProxyAgent() {
  const proxyUrl = (process.env.GEMINI_PROXY_URL || '').trim();
  if (!proxyUrl) return null;

  try {
    if (/^socks/i.test(proxyUrl)) {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      return new SocksProxyAgent(proxyUrl);
    }
    const { HttpsProxyAgent } = require('https-proxy-agent');
    return new HttpsProxyAgent(proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`);
  } catch (err) {
    console.error('[Gemini] Invalid GEMINI_PROXY_URL, connecting directly:', err.message);
    return null;
  }
}

const proxyAgent = buildProxyAgent();
if (proxyAgent) {
  // Log host only — never print proxy credentials
  const masked = process.env.GEMINI_PROXY_URL.replace(/\/\/[^@/]*@/, '//***@');
  console.log(`[Gemini] Using proxy for AI requests: ${masked}`);
}

/**
 * Send a chat completion request to Gemini.
 * @param {object} body - OpenAI-style body ({ messages, tools, tool_choice, ... }). `model` defaults to GEMINI_MODEL.
 * @param {object} [options]
 * @param {string} [options.apiKey] - Defaults to GEMINI_API_KEY.
 * @param {number} [options.timeout] - Request timeout in ms (default 60000).
 */
function geminiChat(body, { apiKey = process.env.GEMINI_API_KEY, timeout = 60000 } = {}) {
  return axios.post(
    GEMINI_API_URL,
    { model: GEMINI_MODEL, ...body },
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout,
      // Disable axios' built-in proxy handling so the agent is used for HTTPS tunneling
      proxy: false,
      ...(proxyAgent ? { httpsAgent: proxyAgent } : {})
    }
  );
}

module.exports = { geminiChat, GEMINI_MODEL, GEMINI_API_URL };

