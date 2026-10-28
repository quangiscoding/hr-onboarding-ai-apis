/**
 * src/ai-gateway/ai-gateway.service.js
 *
 * =============================================================================
 * SERVICE PATTERN: AI GATEWAY SERVICE (ENTERPRISE BACKEND GATEWAY)
 * =============================================================================
 * Nhiệm vụ chính:
 * 1. Xác thực bảo mật: Kiểm tra Shared Secret Token và danh sách Whitelist Email.
 * 2. Dispatcher dùng chung: Đồng nhất quy trình gọi AI cho nhiều Provider khác nhau.
 * 3. Chống lỗi & Độ sẵn sàng cao (High Availability):
 *    - Tự động xoay vòng danh sách Model (Fallback Chain) khi gặp lỗi 404, 503, 400...
 *    - Tự động xoay vòng API Key & Retry Exponential Backoff khi dính lỗi 429 (Rate Limit).
 * 4. Tách biệt trách nhiệm (Separation of Concerns):
 *    - Không can thiệp trực tiếp vào Sheet mà ủy quyền toàn bộ việc ghi log và tính chi phí ($)
 *      cho `AiGatewayLoggerService`.
 */
class AiGatewayService {
  /**
   * Trích xuất danh sách API Keys của một Provider từ Script Properties.
   * Hỗ trợ 2 định dạng cấu hình:
   *  - Dạng 1: Một key chứa nhiều token cách nhau bằng dấu phẩy (VD: "keyA, keyB, keyC")
   *  - Dạng 2: Các key có hậu tố số (VD: "KEY", "KEY_2", "KEY_3", ..., "KEY_10")
   *
   * @param {string} propertyName - Tên biến môi trường (VD: "GEMINI_API_KEY", "OPENROUTER_API_KEY")
   * @returns {string[]} Danh sách các API key hợp lệ
   */
  static getProviderKeys(propertyName) {
    const props = PropertiesService.getScriptProperties();
    const keys = [];

    // 1. Đọc key chính (có thể chứa chuỗi ngăn cách bởi dấu phẩy)
    const mainKey = props.getProperty(propertyName);
    if (mainKey) {
      keys.push(...AiGatewayUtil.parseKeyList(mainKey));
    }

    // 2. Quét tuần tự các key phụ có hậu tố _2 đến _10 (dừng khi gặp key trống)
    for (let i = 2; i <= 10; i++) {
      const k = props.getProperty(`${propertyName}_${i}`);
      if (k) keys.push(k.trim());
      else break;
    }

    return keys;
  }

  /**
   * Xác thực tính hợp lệ của request gửi tới Gateway.
   * - Lớp 1: Bắt tay qua mã bí mật nội bộ (Shared Secret Key).
   * - Lớp 2: Kiểm tra Whitelist Email (nếu danh sách ALLOWED_USERS được thiết lập).
   *
   * @param {Object} payload - Dữ liệu JSON đã parse từ client gửi lên
   * @returns {{ ok: boolean, error?: string }}
   */
  static authenticateRequest(payload) {
    const expectedSecret = PropertiesService.getScriptProperties().getProperty(
      AiGatewayConfig.SECURITY.SHARED_SECRET_PROPERTY,
    );

    // Kiểm tra cấu hình hệ thống máy chủ
    if (!expectedSecret) {
      return {
        ok: false,
        error:
          "Server chưa cấu hình SHARED_SECRET_KEY trong Script Properties.",
      };
    }

    // Lớp 1: Kiểm tra Secret Token khớp nối
    if (!payload || payload.secret !== expectedSecret) {
      return {
        ok: false,
        error:
          "403 Forbidden: Mật mã Shared Secret không hợp lệ hoặc bị thiếu.",
      };
    }

    // Lớp 2: Kiểm tra quyền tài khoản người gọi (Whitelisting)
    const allowedUsers = AiGatewayConfig.ALLOWED_USERS || [];
    if (allowedUsers.length > 0) {
      const callerEmail = (payload.userEmail || "").toLowerCase().trim();
      const isAllowed = allowedUsers.some(
        (e) => e.toLowerCase().trim() === callerEmail,
      );
      if (!isAllowed) {
        return {
          ok: false,
          error: `403 Forbidden: Tài khoản "${callerEmail}" không có quyền truy cập.`,
        };
      }
    }

    return { ok: true };
  }

  /* =========================================================================
   * HÀM DÙNG CHUNG: XOAY VÒNG MODEL & XOAY VÒNG KEY (UNIVERSAL DISPATCHER)
   * ========================================================================= */

  /**
   * Điều phối thực thi yêu cầu gọi AI với 2 vòng lặp phòng thủ:
   * - Vòng 1 (Model Level): Duyệt qua danh sách Model dự phòng nếu model trước thất bại.
   * - Vòng 2 (Key Level): Nếu gặp lỗi 429 (Rate Limit), tạm dừng (backoff) và đổi sang API Key tiếp theo.
   *
   * @private
   * @param {Object} params
   * @param {string} params.provider - Tên nhà cung cấp ("gemini", "openrouter", "openai"...)
   * @param {string} [params.requestedModel] - Model cụ thể client muốn dùng trước
   * @param {Array} params.promptParts - Dữ liệu prompt text và file base64
   * @returns {{ ok: boolean, text: string, provider: string, model: string, inputTokens: number, outputTokens: number }}
   */
  static executeWithFallback_({ provider, requestedModel, promptParts }) {
    // 1. Kiểm tra cấu hình của Provider
    const providerConfig = AiGatewayConfig.PROVIDERS[provider.toUpperCase()];
    if (!providerConfig) {
      throw new Error(
        `Nhà cung cấp "${provider}" không được hỗ trợ trong AiGatewayConfig.`,
      );
    }

    // 2. Lấy danh sách API keys tương ứng
    const keys = this.getProviderKeys(providerConfig.KEY_PROPERTY);
    if (keys.length === 0) {
      throw new Error(
        `Chưa cấu hình API Key ("${providerConfig.KEY_PROPERTY}") trong Script Properties.`,
      );
    }

    // 3. Chuẩn bị danh sách Model cần chạy:
    // Nếu client có yêu cầu đích danh 1 model, đưa model đó lên vị trí ưu tiên đầu tiên
    let modelsToTry = [
      ...(providerConfig.MODELS || [providerConfig.DEFAULT_MODEL]),
    ];
    if (requestedModel) {
      modelsToTry = [
        requestedModel,
        ...modelsToTry.filter((m) => m !== requestedModel),
      ];
    }

    const delays = AiGatewayConfig.RETRY_DELAYS_MS || [2000, 5000];
    const errors = [];

    // =========================================================================
    // VÒNG LẶP 1: DUYỆT XOAY VÒNG DANH SÁCH MODEL (FALLBACK CHAIN)
    // =========================================================================
    for (const model of modelsToTry) {
      // =======================================================================
      // VÒNG LẶP 2: DUYỆT XOAY VÒNG KEY & RETRY BACKOFF KHI GẶP RATE LIMIT (429)
      // =======================================================================
      for (let attempt = 0; attempt <= delays.length; attempt++) {
        // Tạm hoãn luồng thực thi (sleep) nếu đây là lượt retry
        if (attempt > 0) {
          Logger.log(
            `⏳ [${provider}] Model "${model}": Gặp lỗi 429, retry sau ${delays[attempt - 1]}ms...`,
          );
          Utilities.sleep(delays[attempt - 1]);
        }

        // Chọn key theo vòng xoay modulo (đảm bảo chia đều tải giữa các key)
        const key = keys[attempt % keys.length];

        // Gửi HTTP Request thông qua adapter dùng chung
        const res = this.dispatchHttpRequest_({
          provider: provider,
          model: model,
          key: key,
          promptParts: promptParts,
          providerConfig: providerConfig,
        });

        // TRƯỜNG HỢP 1: THÀNH CÔNG -> Ngắt toàn bộ vòng lặp và trả về kết quả
        if (res.ok) {
          return {
            ok: true,
            text: res.text,
            provider: providerConfig.NAME,
            model: model, // Trả về chính xác model thực tế đã phản hồi thành công
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
          };
        }

        // TRƯỜNG HỢP 2: BỊ RATE LIMIT (HTTP 429) -> Tiếp tục vòng lặp retry với key tiếp theo
        if (res.statusCode === 429) {
          errors.push(
            `[${provider} | ${model} | Key #${(attempt % keys.length) + 1}] (Attempt ${attempt + 1}): ${res.error}`,
          );
          continue;
        }

        // TRƯỜNG HỢP 3: LỖI KHÁC (HTTP 404, 503, 400...) -> Thoát vòng lặp key, chuyển sang model tiếp theo
        errors.push(
          `[${provider} | ${model}]: HTTP ${res.statusCode} - ${res.error}`,
        );
        break;
      }
    }

    // Ném lỗi tổng hợp nếu toàn bộ chuỗi model và key đều thất bại
    throw new Error(
      `Tất cả các model của ${provider} đều thất bại:\n` + errors.join("\n"),
    );
  }

  /**
   * Bắn HTTP request đơn lẻ tới API của nhà cung cấp.
   * Tự động điều chỉnh cấu trúc Body và Header theo từng chuẩn:
   *  - Chuẩn Google Gemini REST: endpoint ?key=... và contents: [{ parts }]
   *  - Chuẩn OpenAI-Compatible (OpenRouter, OpenAI...): Bearer Token và messages: [{ role, content }]
   *
   * @private
   * @returns {{ ok: boolean, text?: string, inputTokens?: number, outputTokens?: number, statusCode?: number, error?: string }}
   */
  static dispatchHttpRequest_({
    provider,
    model,
    key,
    promptParts,
    providerConfig,
  }) {
    let url = "";
    let headers = {};
    let requestPayload = {};

    // 1. Phân loại cấu hình Payload theo giao thức API của từng Provider
    if (provider === "gemini") {
      // Endpoint chuẩn của Google Generative Language API
      url = `${providerConfig.BASE_URL}/models/${model}:generateContent?key=${key}`;
      headers = { "Content-Type": "application/json" };
      requestPayload = {
        contents: AiGatewayUtil.transformToGeminiContents(promptParts),
        generationConfig: {},
      };
    } else {
      // Endpoint chuẩn OpenAI / OpenRouter Chat Completions
      url = providerConfig.BASE_URL;
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "https://script.google.com",
        "X-Title": "AI Gateway",
      };
      requestPayload = {
        model: model,
        messages: AiGatewayUtil.transformToOpenAiMessages(promptParts),
        max_tokens: 1500,
      };
    }

    // 2. Thực hiện HTTP POST bằng UrlFetchApp
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: headers,
      payload: JSON.stringify(requestPayload),
      muteHttpExceptions: true, // Tránh văng Exception để tự kiểm soát mã HTTP Status
    });

    const statusCode = response.getResponseCode();
    const rawText = response.getContentText() || "{}";
    const body = AiGatewayUtil.safeParseJson(rawText) || {};

    // Xử lý khi HTTP Status khác 200 OK
    if (statusCode !== 200) {
      const errMsg =
        (body.error && (body.error.message || body.error)) || rawText;
      return { ok: false, statusCode: statusCode, error: errMsg };
    }

    // 3. Chuẩn hóa dữ liệu trả về (Text + Token Metadata) theo từng chuẩn
    if (provider === "gemini") {
      if (!body.candidates || !body.candidates[0]) {
        return {
          ok: false,
          statusCode: statusCode,
          error: "Gemini trả về candidates rỗng",
        };
      }
      const parts =
        body.candidates[0].content && body.candidates[0].content.parts;
      const text =
        parts &&
        parts
          .map((p) => p.text || "")
          .join("")
          .trim();
      const usage = body.usageMetadata || {};

      return {
        ok: true,
        text: text,
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0,
      };
    } else {
      if (!body.choices || !body.choices[0]) {
        return {
          ok: false,
          statusCode: statusCode,
          error: "OpenAI/OpenRouter trả về choices rỗng",
        };
      }
      const text = String(body.choices[0].message?.content || "").trim();
      const usage = body.usage || {};

      return {
        ok: true,
        text: text,
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
      };
    }
  }

  /* =========================================================================
   * CONTROLLER HANDLER: TIẾP NHẬN YÊU CẦU & ĐIỀU PHỐI GHI LOG
   * ========================================================================= */

  /**
   * Entry Point chính tiếp nhận rawBody từ Web App controller (main.js).
   * Đo đạc thời gian chạy (latency) và ủy quyền ghi log cho AiGatewayLoggerService.
   *
   * @param {string} rawBody - Chuỗi JSON gửi lên từ client
   * @returns {Object} Plain Object kết quả { ok: true, text, ... } hoặc { ok: false, error }
   */
  static handleGatewayRequest(rawBody) {
    const timeStart = new Date();
    const payload = AiGatewayUtil.safeParseJson(rawBody);

    // 1. Kiểm tra định dạng JSON
    if (!payload) {
      return {
        ok: false,
        error: "400 Bad Request: Dữ liệu gửi lên không đúng định dạng JSON.",
      };
    }

    // 2. Kiểm tra xác thực (Secret Token & User Whitelist)
    const auth = this.authenticateRequest(payload);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }

    // 3. Kiểm tra tính hợp lệ của Prompt đầu vào
    if (
      !payload.promptParts ||
      !Array.isArray(payload.promptParts) ||
      payload.promptParts.length === 0
    ) {
      return { ok: false, error: "400 Bad Request: Thiếu promptParts." };
    }

    const provider = (
      payload.provider || AiGatewayConfig.DEFAULT_PROVIDER
    ).toLowerCase();

    try {
      // 4. Kích hoạt bộ điều phối gọi AI
      const result = this.executeWithFallback_({
        provider: provider,
        requestedModel: payload.model,
        promptParts: payload.promptParts,
      });

      // Đo thời gian xử lý thực tế (Latency)
      const timeEnd = new Date();
      const latencySec = Number(((timeEnd - timeStart) / 1000).toFixed(2));

      // 5. Ủy quyền ghi log THÀNH CÔNG sang Service Logger chuyên trách
      AiGatewayLoggerService.logRequest({
        callerEmail: payload.userEmail,
        sourceApp: payload.sourceApp || "Onboarding Sheet",
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        latencySec: latencySec,
        status: "SUCCESS",
      });

      return result;
    } catch (err) {
      const timeEnd = new Date();
      const latencySec = Number(((timeEnd - timeStart) / 1000).toFixed(2));

      // 6. Ủy quyền ghi log THẤT BẠI sang Service Logger chuyên trách
      AiGatewayLoggerService.logRequest({
        callerEmail: payload.userEmail,
        sourceApp: payload.sourceApp || "Onboarding Sheet",
        provider: provider,
        model: payload.model || "N/A",
        inputTokens: 0,
        outputTokens: 0,
        latencySec: latencySec,
        status: "FAILED",
        errorDetail: err.message || err.toString(),
      });

      return { ok: false, error: err.message || err.toString() };
    }
  }
}
