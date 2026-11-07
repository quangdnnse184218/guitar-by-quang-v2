// Logic thuần (không I/O) để đọc phản hồi của Apps Script khi CẤP quyền Drive.
//
// Apps Script luôn trả HTTP 200, kể cả khi thất bại: sai secret → {"error":"unauthorized"},
// file không tồn tại / không phải chủ file → {"error":"Exception: ..."}. Chỉ {"success":true}
// mới là đã chia sẻ thật. Trước đây hàm coi mọi lần gọi không ném lỗi mạng là thành công, nên
// admin thấy "Đã chia sẻ Drive" trong khi khách chưa xem được file.

export type DriveGrantResult = { ok: boolean; reason?: string };

export function parseDriveGrantResponse(status: number, raw: string): DriveGrantResult {
  if (status < 200 || status >= 300) return { ok: false, reason: `apps_script_http_${status}` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "unexpected_apps_script_response" };
  }
  const body = parsed as { success?: unknown; error?: unknown } | null;
  if (body && body.success === true) return { ok: true };
  const error = body && typeof body.error === "string" ? body.error : "";
  return { ok: false, reason: error ? `apps_script_error: ${error.slice(0, 200)}` : "apps_script_refused_grant" };
}
