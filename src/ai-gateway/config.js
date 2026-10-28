/**
 * src/ai-gateway/AiGatewayConfig.js
 */
const AiGatewayConfig = {
  DEFAULT_PROVIDER: "openrouter",

  // Thời gian chờ (ms) giữa các lần thử lại khi gặp lỗi 429 (Rate Limit)
  RETRY_DELAYS_MS: [2000, 5000],

  PROVIDERS: {
    OPENROUTER: {
      NAME: "openrouter",
      BASE_URL: "https://openrouter.ai/api/v1/chat/completions",
      // Danh sách model xoay vòng theo thứ tự ưu tiên
      MODELS: [
        "google/gemini-2.5-flash",
        "meta-llama/llama-3.3-70b-instruct",
        "mistralai/mistral-small-24b-instruct-2501",
      ],
      KEY_PROPERTY: "OPENROUTER_API_KEY",
    },
    GEMINI: {
      NAME: "gemini",
      BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
      // Danh sách model xoay vòng theo thứ tự ưu tiên
      MODELS: [
        "gemini-flash-latest",
        "gemini-2.5-flash",
        "gemini-3.8-flash",
        "gemini-3.7-flash",
      ],
      KEY_PROPERTY: "GEMINI_API_KEY",
    },
  },

  SECURITY: {
    SHARED_SECRET_PROPERTY: "SHARED_SECRET_KEY",
  },

  ALLOWED_USERS: [],

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
