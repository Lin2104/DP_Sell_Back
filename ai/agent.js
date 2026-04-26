const axios = require('axios');
const tools = require("./tools");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const PRIMARY_MODEL = "google/gemini-2.0-flash-001";

class OpenRouterAgent {
  constructor(apiKey) {
    if (!apiKey) throw new Error("OpenRouter API Key is required");
    this.apiKey = apiKey;
    this.chatHistory = []; // To store chat history for context
    this.isRunning = false;
    this.logs = [];

    // Define the tools (function declarations) for OpenRouter
    this.openRouterTools = [
      {
        type: "function",
        function: {
          name: "get_catalog",
          description: "Get all available categories in the store.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_games_by_category",
          description: "Get all games within a specific category.",
          parameters: {
            type: "object",
            properties: {
              categoryId: { type: "string", description: "The ID of the category." }
            },
            required: ["categoryId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_products_by_game",
          description: "Get all available products (prices/options) for a specific game.",
          parameters: {
            type: "object",
            properties: {
              gameId: { type: "string", description: "The ID of the game." }
            },
            required: ["gameId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_category",
          description: "Add a new category to the store.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string", enum: ["top-up", "digital-product"] }
            },
            required: ["name", "type"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_pending_orders",
          description: "Get all orders currently in 'pending' status.",
          parameters: {
            type: "object",
            properties: {},
            required: []
          }
        }
      },
      {
        type: "function",
        function: {
          name: "update_order_status",
          description: "Update the status of an order.",
          parameters: {
            type: "object",
            properties: {
              orderId: { type: "string" },
              status: { type: "string", enum: ["processing", "completed", "failed", "rejected"] }
            },
            required: ["orderId", "status"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_game_info",
          description: "Search for a game's details like description, icons, screenshots, trailer, and system requirements.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The name of the game to search for." }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_products",
          description: "Search the internal database for specific games or products listed in the shop.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The product or game name to search for (e.g. 'Wukong')." }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_game",
          description: "Add a new game/service to the catalog.",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              categoryId: { type: "string" },
              icon: { type: "string" },
              description: { type: "string" },
              benefits: { type: "array", items: { type: "string" } },
              purchaseInfo: { type: "array", items: { type: "string" } },
              trailerUrl: { type: "string" },
              screenshots: { type: "array", items: { type: "string" } },
              systemRequirements: {
                type: "object",
                properties: {
                  os: { type: "string" },
                  processor: { type: "string" },
                  memory: { type: "string" },
                  graphics: { type: "string" },
                  storage: { type: "string" }
                }
              }
            },
            required: ["name", "categoryId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "add_product",
          description: "Add a specific product/price point to a game. This is where you set the actual price for the item.",
          parameters: {
            type: "object",
            properties: {
              gameId: { type: "string" },
              name: { type: "string", description: "The name of the item, e.g., '100 Diamonds' or 'Global Steam Key'." },
              price: { type: "number", description: "The price in MMK (e.g., 20000)." },
              icon: { type: "string", description: "The icon for the product. If not found, use a default image URL or inherit from the game's icon." }
            },
            required: ["gameId", "name", "price"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "send_telegram_notification",
          description: "Send a message to the user or admin via Telegram.",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string" },
              chatId: { type: "string", description: "The Telegram Chat ID to send to. Defaults to Admin if not provided." }
            },
            required: ["message"]
          }
        }
      }
    ];
  }

  log(msg) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(entry);
    this.logs.push(entry);
    if (this.logs.length > 100) this.logs.shift();
  }

  async handleUserMessage(message, chatId) {
    this.log(`Received Telegram command from ${chatId}: ${message}`);
    this.chatHistory.push({ role: "user", content: `[Telegram Message from ${chatId}]: ${message}` });
    await this.runCycle();
  }

  async runCycle() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log("Starting AI automation cycle...");

    try {
      const systemPrompt = `You are the AI Customer Support Manager of "Blasky Game Shop".
      Your goals:
      1. Provide accurate help to customers in Myanmar (Burmese) language.
      2. If a customer asks to buy a game (e.g., "I want to buy Wukong"), ALWAYS use 'search_products' first.
      3. Only use 'get_catalog' for categories, 'get_games_by_category' for games, and 'get_products_by_game' for items.
      4. IMPORTANT: Minimize data fetching. Don't fetch the whole catalog if you can search for a specific item.
      5. Explain the project structure and business flows (Top-up, Digital Products, Payment Process, etc.).
      6. Escalate to human if needed using the keyword "TRANSFER_TO_HUMAN".

      ### KNOWLEDGE BASE:
      - MOBILE LEGENDS: Requires "Player ID" and "Zone ID".
      - DIGITAL PRODUCTS: Keys sent to "Email" as PDF.
      - PAYMENT: Manual (Kpay/Wave) or MMQR. Manual requires "Screenshot" upload.
      
      ### LANGUAGE RULES:
      - ALWAYS respond in Myanmar (Burmese) language for general conversation.
      - Use English for technical terms: "system", "Download", "Install", "VPN", "Steam", "ID", "Order", "Status", "Payment", "Screenshot".
      - TONE: ALWAYS use male honorifics "ခင်ဗျာ" (Khin Byar). NEVER use "ရှင်" (Shin).`;

      // Add system prompt to chat history if not already there
      if (this.chatHistory.length === 0 || this.chatHistory[0].role !== 'system') {
        this.chatHistory.unshift({ role: "system", content: systemPrompt });
      }

      let processing = true;
      let iterations = 0;
      const MAX_ITERATIONS = 5; // Safety cap

      while (processing && iterations < MAX_ITERATIONS) {
        iterations++;
        
        let retryCount = 0;
        const MAX_RETRIES = 5;
        let response;

        while (retryCount < MAX_RETRIES) {
          try {
            response = await axios.post(
              OPENROUTER_API_URL,
              {
                model: PRIMARY_MODEL,
                messages: this.chatHistory,
                tools: this.openRouterTools,
                tool_choice: "auto"
              },
              {
                headers: {
                  "Authorization": `Bearer ${this.apiKey}`,
                  "Content-Type": "application/json",
                  "X-Title": "DP_Sell AI Agent",
                  "HTTP-Referer": "https://github.com/Lin2104/DP_Sell_Back" // Good practice for OpenRouter
                },
                timeout: 60000 
              }
            );
            break; // Success
          } catch (apiErr) {
            retryCount++;
            const status = apiErr.response ? apiErr.response.status : null;
            
            const isRetryable = status === 504 || status === 502 || status === 503 || status === 429 || !status;
            
            if (isRetryable && retryCount < MAX_RETRIES) {
              const delay = Math.pow(2, retryCount) * 2000; // 4s, 8s, 16s, 32s
              this.log(`[AI Retry] Attempt ${retryCount} failed with ${status || apiErr.message}. Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw apiErr;
          }
        }

        if (!response.data || !response.data.choices || !response.data.choices[0]) {
          throw new Error('Invalid response format from OpenRouter');
        }

        const responseData = response.data.choices[0].message;
        this.chatHistory.push(responseData);

        // Handle tool calls
        if (responseData.tool_calls && responseData.tool_calls.length > 0) {
          for (const call of responseData.tool_calls) {
            const functionName = call.function.name;
            const functionArgs = JSON.parse(call.function.arguments);

            this.log(`AI Calling tool: ${functionName} with args: ${JSON.stringify(functionArgs)}`);
            
            if (tools[functionName]) {
              const toolResult = await tools[functionName](functionArgs);
              this.log(`Tool ${functionName} executed successfully. Result: ${JSON.stringify(toolResult)}`);

              // Send tool result back to AI
              this.chatHistory.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(toolResult)
              });
            } else {
              this.log(`Error: Tool ${functionName} not found.`);
              this.chatHistory.push({
                role: "tool",
                tool_call_id: call.id,
                content: `Error: Tool ${functionName} not found.`
              });
            }
          }
          // After handling tools, the loop will continue to get the next response from AI
        } else {
          // No more tool calls, AI has given a final response or message
          if (responseData.content) {
            this.log(`AI Response: ${responseData.content}`);
          }
          processing = false;
        }

        // Manage history size AFTER tool cycle to avoid large payloads
        if (this.chatHistory.length > 15) {
          this.chatHistory = [
            { role: "system", content: systemPrompt },
            ...this.chatHistory.slice(-12)
          ];
        }
      }

      this.log("Cycle completed.");
    } catch (err) {
      this.log(`Error in cycle: ${err.message}`);
      if (err.response) {
        this.log(`OpenRouter API Error: ${JSON.stringify(err.response.data)}`);
      }
    } finally {
      this.isRunning = false;
    }
  }

  start(intervalMs = 60000) { // Default 1 minute
    this.log("AI Agent started 24/7.");
    this.timer = setInterval(() => this.runCycle(), intervalMs);
    this.runCycle(); // Run immediately
  }

  stop() {
    this.log("AI Agent stopped.");
    clearInterval(this.timer);
  }
}

let activeAgent = null;

module.exports = {
  startAgent: (apiKey) => {
    if (activeAgent) activeAgent.stop();
    activeAgent = new OpenRouterAgent(apiKey);
    activeAgent.start();
    return activeAgent;
  },
  getAgent: () => activeAgent,
  stopAgent: () => {
    if (activeAgent) activeAgent.stop();
    activeAgent = null;
  }
};
