/**
 * ============================================================================
 * GOOGLE APPS SCRIPT — CẤP & GỠ QUYỀN XEM FILE GOOGLE DRIVE
 * ============================================================================
 * Code của Web App trung gian giữa Supabase Edge Functions và Google Drive.
 * KHÔNG được Vite build, không nằm trong website — chỉ lưu trong repo để biết
 * phía Drive đang chạy logic gì. Secret thật KHÔNG được ghi vào file này.
 *
 * CÁCH CÀI (làm 1 lần)
 * 1. Mở https://script.google.com bằng tài khoản Google đang SỞ HỮU các file
 *    Drive bán tab (phải là owner mới đổi được quyền).
 * 2. Dán file này vào Code.gs, thay SECRET_TOKEN cho khớp với
 *    app_secrets.drive_grant_apps_script_secret trong Supabase.
 * 3. Deploy → Manage deployments → bút chì → Version: "New version" → Deploy.
 *    (URL giữ nguyên. Nếu chọn "New deployment" sẽ ra URL mới.)
 * 4. Lưu URL /exec vào Supabase SQL Editor:
 *
 *      insert into public.app_secrets (key, value)
 *      values ('drive_revoke_webapp_url', 'https://script.google.com/macros/s/..../exec')
 *      on conflict (key) do update set value = excluded.value;
 *
 *    Chỉ set khoá này SAU KHI đã deploy bản có nhánh revoke: Edge Function
 *    không gọi Drive nếu khoá trống, nên không bao giờ gửi lệnh thu hồi tới
 *    một script chỉ biết cấp quyền.
 *
 * HỢP ĐỒNG DỮ LIỆU
 *   Cấp quyền (sepay-ipn, admin-grant-access): { secret, fileId, email, isFolder }
 *   Thu hồi (admin-revoke-access):
 *     { secret, action: "revoke", revokeFileId, revokeEmail, isFolder }
 *
 * Payload thu hồi dùng tên field khác (`revokeFileId`, không phải `fileId`) CÓ
 * Ý: nếu URL bị trỏ nhầm vào một bản script cũ chỉ biết cấp quyền, bản cũ sẽ
 * thấy fileId = undefined và trả lỗi, thay vì âm thầm CẤP quyền ngược ý định.
 */

const SECRET_TOKEN = 'DAN_SECRET_CUA_BAN_VAO_DAY';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET_TOKEN) return jsonOutput({ error: 'unauthorized' });

    if (body.action === 'revoke') return handleRevoke(body);

    const { fileId, email, isFolder } = body;
    if (!fileId || !email) return jsonOutput({ error: 'missing_fileId_or_email' });
    const target = isFolder ? DriveApp.getFolderById(fileId) : DriveApp.getFileById(fileId);
    target.addViewer(email);
    return jsonOutput({ success: true });
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

/**
 * Gỡ quyền xem/sửa của một email. Bỏ qua lỗi "email này vốn không có quyền":
 * kết quả mong muốn (email không còn quyền) vẫn đúng nên không báo thất bại.
 */
function handleRevoke(body) {
  const { revokeFileId, revokeEmail, isFolder } = body;
  if (!revokeFileId || !revokeEmail) {
    return jsonOutput({ ok: false, action: 'revoke', reason: 'missing_revokeFileId_or_revokeEmail' });
  }

  const target = isFolder ? DriveApp.getFolderById(revokeFileId) : DriveApp.getFileById(revokeFileId);

  try { target.removeViewer(revokeEmail); } catch (err) { Logger.log('removeViewer: ' + err); }
  try { target.removeEditor(revokeEmail); } catch (err) { Logger.log('removeEditor: ' + err); }

  // Nếu file đang mở "bất kỳ ai có link" thì gỡ email không có tác dụng — ai
  // có link vẫn xem được.
  let stillPublic = false;
  try {
    const access = target.getSharingAccess();
    stillPublic = access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK;
  } catch (err) {
    Logger.log('getSharingAccess: ' + err);
  }

  return jsonOutput({ ok: true, action: 'revoke', stillPublic });
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
