/**
 * main.js - Controller Entry Point của Web App
 */

/**
 * Đón nhận POST request từ Onboarding Sheet
 * @param {Object} e - Event object từ Web App
 */
function doPost(e) {
  const rawBody = e && e.postData && e.postData.contents;

  // Lấy email thật từ phiên xác thực Google Workspace
  const callerEmail = (e && e.user) || Session.getActiveUser().getEmail();

  // Ủy quyền xử lý cho Service
  const result = AiGatewayService.handleGatewayRequest(rawBody, callerEmail);

  // Trả về JSON output qua Util
  return AiGatewayUtil.buildJsonResponse(result);
}

/**
 * Health check endpoint (mở link Web App trên trình duyệt để kiểm tra)
 */
function doGet(e) {
  return AiGatewayUtil.buildJsonResponse({
    ok: true,
    service: "Enterprise AI Gateway",
    timestamp: new Date().toISOString(),
  });
}
