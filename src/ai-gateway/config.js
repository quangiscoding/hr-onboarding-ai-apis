/**
 * ai-gateway/config.js
 */
const AiGatewayConfig = {
  DEFAULT_PROVIDER: "openrouter",

  RETRY_DELAYS_MS: [2000, 5000],

  PROVIDERS: {
    GEMINI: {
      NAME: "gemini",
      BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
      MODELS: [
        "gemini-flash-latest",
        "gemini-2.5-flash",
        "gemini-3.8-flash",
        "gemini-3.7-flash",
      ],
      KEY_PROPERTY: "GEMINI_API_KEY",
    },
    OPENROUTER: {
      NAME: "openrouter",
      BASE_URL: "https://openrouter.ai/api/v1/chat/completions",
      MODELS: ["google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"],
      KEY_PROPERTY: "OPENROUTER_API_KEY",
    },
  },

  // Danh sách email nhân sự được phép gọi (để rỗng [] nếu cho phép toàn bộ công ty)
  ALLOWED_USERS: [
    // "hr1@kyanon.digital",
  ],

  LOG: {
    SHEET_NAME: "AI Gateway Log",
  },

  PRICING: {
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-flash-latest": { input: 0.3, output: 2.5 },
    "google/gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
    "gemini-3.8-flash": { input: 0.75, output: 3.75 },
    "gemini-3.7-flash": { input: 0.75, output: 3.75 },
    DEFAULT: { input: 0.3, output: 2.5 },
  },
};
