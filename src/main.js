/**
 * main.js - Controller Entry Point của Web App
 */

/**
 * Đón nhận POST request từ Onboarding Sheet hoặc các client nội bộ
 * @param {Object} e - Event object từ Web App
 */
function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents;
    if (!rawBody) {
      return AiGatewayUtil.buildJsonResponse({
        ok: false,
        error: "400 Bad Request: Request body rỗng hoặc không đúng định dạng.",
      });
    }

    // 1. Thử lấy email từ phiên làm việc Google Workspace (nếu môi trường cho phép)
    let callerEmail = "";
    try {
      callerEmail = Session.getActiveUser().getEmail();
    } catch (err) {
      callerEmail = "";
    }

    // 2. Chuyển quyền xử lý cho AiGatewayService
    // (Nếu callerEmail rỗng, Service sẽ tự fallback sang payload.userEmail do client gửi)
    const result = AiGatewayService.handleGatewayRequest(rawBody, callerEmail);

    return AiGatewayUtil.buildJsonResponse(result);
  } catch (error) {
    return AiGatewayUtil.buildJsonResponse({
      ok: false,
      error: "500 Internal Server Error: " + (error.message || error.toString()),
    });
  }
}

/**
 * Health check endpoint (dùng để kiểm tra trạng thái hoạt động của Web App qua trình duyệt)
 */
function doGet(e) {
  return AiGatewayUtil.buildJsonResponse({
    ok: true,
    service: "Enterprise AI Gateway",
    timestamp: new Date().toISOString(),
  });
}
