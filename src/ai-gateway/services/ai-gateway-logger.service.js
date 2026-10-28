/**
 * Service Pattern: Chuyên trách tính toán chi phí token và ghi log tập trung trên Gateway Sheet.
 */
class AiGatewayLoggerService {
  /**
   * Tính toán chi phí dựa trên số lượng tokens và đơn giá ($/1M tokens)
   * @param {Object} params - { model, inputTokens, outputTokens }
   * @returns {number} Tổng chi phí USD
   */
  static calculateCost({ model, inputTokens, outputTokens }) {
    const pricing =
      AiGatewayConfig.PRICING[model] || AiGatewayConfig.PRICING.DEFAULT;
    const inCost = ((inputTokens || 0) / 1000000) * pricing.input;
    const outCost = ((outputTokens || 0) / 1000000) * pricing.output;
    return Number((inCost + outCost).toFixed(6));
  }

  /**
   * Đảm bảo sheet log tồn tại và có đủ header cột chuẩn
   * @private
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   */
  static getOrCreateLogSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(AiGatewayConfig.SHEETS.LOG);

    if (!sheet) {
      sheet = ss.insertSheet(AiGatewayConfig.SHEETS.LOG);
      sheet.appendRow([
        "Timestamp",
        "Caller Email",
        "Source App",
        "Provider",
        "Model",
        "Input Tokens",
        "Output Tokens",
        "Latency (s)",
        "Total Cost ($)",
        "Status",
        "Error Details",
      ]);
      sheet.getRange("A1:K1").setFontWeight("bold");
    }

    return sheet;
  }

  /**
   * Ghi log thực thi của một request
   * @param {Object} params
   * @param {string} params.callerEmail
   * @param {string} params.sourceApp
   * @param {string} params.provider
   * @param {string} params.model
   * @param {number} params.inputTokens
   * @param {number} params.outputTokens
   * @param {number} params.latencySec
   * @param {string} params.status - "SUCCESS" | "FAILED"
   * @param {string} [params.errorDetail]
   */
  static logRequest({
    callerEmail,
    sourceApp,
    provider,
    model,
    inputTokens,
    outputTokens,
    latencySec,
    status,
    errorDetail,
  }) {
    try {
      const sheet = this.getOrCreateLogSheet_();
      const totalCost = this.calculateCost({
        model,
        inputTokens,
        outputTokens,
      });

      sheet.appendRow([
        new Date(),
        callerEmail || "N/A",
        sourceApp || "Recruitment Onboarding",
        provider || "N/A",
        model || "N/A",
        inputTokens || 0,
        outputTokens || 0,
        latencySec || 0,
        totalCost,
        status,
        errorDetail || "",
      ]);
    } catch (e) {
      Logger.log("⚠️ Lỗi trong AiGatewayLoggerService: " + e.message);
    }
  }
}
