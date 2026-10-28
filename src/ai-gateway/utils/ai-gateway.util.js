/**
 * ai-gateway/utils/ai-gateway.util.js
 * Tiện ích xử lý dữ liệu và định dạng payload cho AI Gateway
 */
class AiGatewayUtil {
  /**
   * Parse chuỗi JSON an toàn
   * @param {string} rawString
   * @returns {Object|null}
   */
  static safeParseJson(rawString) {
    if (!rawString || typeof rawString !== "string") return null;
    try {
      return JSON.parse(rawString);
    } catch (e) {
      return null;
    }
  }

  /**
   * Tạo TextOutput chuẩn JSON cho Web App response
   * @param {Object} data
   * @returns {GoogleAppsScript.Content.TextOutput}
   */
  static buildJsonResponse(data) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
      ContentService.MimeType.JSON,
    );
  }

  /**
   * Parse chuỗi keys từ Script Properties (phân cách bởi dấu phẩy)
   * @param {string} rawKeys
   * @returns {string[]}
   */
  static parseKeyList(rawKeys) {
    if (!rawKeys || typeof rawKeys !== "string") return [];
    return rawKeys
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  /**
   * Chuẩn hóa payload sang format OpenAI Chat Completions
   * @param {Array} promptParts
   * @returns {Array} messages array
   */
  static transformToOpenAiMessages(promptParts) {
    const content = [];
    promptParts.forEach((part) => {
      if (part.text) {
        content.push({ type: "text", text: part.text });
      } else if (part.inline_data) {
        content.push({
          type: "file",
          file: {
            filename: "document.pdf",
            file_data: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`,
          },
        });
      }
    });
    return [{ role: "user", content: content }];
  }

  /**
   * Chuẩn hóa payload sang format Google Gemini generateContent
   * @param {Array} promptParts
   * @returns {Array} contents array
   */
  static transformToGeminiContents(promptParts) {
    const parts = promptParts.map((part) => {
      if (part.inline_data) {
        return {
          inline_data: {
            mime_type: part.inline_data.mime_type,
            data: part.inline_data.data,
          },
        };
      }
      return { text: part.text || "" };
    });
    return [{ parts: parts }];
  }
}
