/**
 * ==============================================================================
 * ADMIN DASHBOARD — THU HỒI QUYỀN XEM TAB (kèm gỡ quyền Google Drive)
 * ==============================================================================
 * Tách riêng vì có 2 nơi cùng thu hồi: bảng "Lịch sử mở khoá" và trang chi tiết
 * một thành viên.
 *
 * Gọi Edge Function `admin-revoke-access` chứ không gọi thẳng RPC
 * `admin_revoke_access` từ trình duyệt: ngoài việc xoá quyền trong DB, Edge
 * Function còn gọi Google Apps Script để gỡ quyền xem file Drive của email
 * khách. Trước đây bước Drive phải làm tay nên khách bị thu hồi trên web vẫn
 * mở được file Drive cũ — coi như chưa thu hồi gì cả.
 */
import { supabase } from '../lib/supabase.js'
import { showToast } from './toast.js'
import { confirmDialog } from './confirm.js'

/** Diễn giải mã lỗi Drive của Edge Function thành câu tiếng Việt cho admin. */
const DRIVE_ERROR_HINTS = {
  revoke_webapp_not_configured:
    'chưa cấu hình Web App gỡ quyền Drive (thiếu app_secrets.drive_revoke_webapp_url)',
  apps_script_secret_missing: 'thiếu secret gọi Apps Script trong app_secrets',
  song_has_no_drive_link: 'bài này không có link Google Drive nào để gỡ',
  user_has_no_email: 'tài khoản khách chưa có email',
  could_not_parse_drive_id: 'không đọc được ID file/folder từ link Drive của bài',
  apps_script_refused_revoke: 'Apps Script từ chối lệnh gỡ quyền',
  unexpected_apps_script_response:
    'Apps Script trả về nội dung lạ — có thể bản deploy chưa có nhánh thu hồi',
  drive_revoke_request_failed: 'không gọi được Apps Script (mạng hoặc URL sai)',
  skipped_by_admin: 'bạn đã chọn không gỡ quyền Drive',
}

/**
 * Hỏi xác nhận rồi thu hồi quyền xem một tab của một thành viên.
 *
 * @returns {Promise<boolean>} true nếu đã thu hồi xong trong DB.
 */
export async function revokeAccess({ userId, songId, userName, songTitle, userEmail }) {
  const answer = await confirmDialog({
    tone: 'danger',
    title: 'Thu hồi quyền xem tab',
    message:
      'Tab này sẽ biến mất khỏi thư viện của khách trên web ngay lập tức. ' +
      'Đơn hàng đã thanh toán vẫn được giữ trong doanh thu.',
    detail: [
      ['Thành viên', userName || userId],
      ...(userEmail ? [['Email', userEmail]] : []),
      ['Bài hát', songTitle || songId],
    ],
    checkbox: {
      label: 'Gỡ luôn quyền xem Google Drive của email này',
      hint: 'Nếu không tích, khách vẫn mở được file Drive đã được chia sẻ trước đó.',
      checked: true,
    },
    input: {
      label: 'Lý do thu hồi (không bắt buộc)',
      placeholder: 'VD: khách hoàn tiền, phát hiện chia sẻ tài khoản…',
    },
    confirmText: 'Thu hồi quyền',
  })

  if (!answer) return false

  try {
    const { data, error } = await supabase.functions.invoke('admin-revoke-access', {
      body: {
        userId,
        songId,
        reason: answer.input || null,
        removeDrive: answer.checkbox,
      },
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Lỗi khi thu hồi quyền')

    if (data.driveRemoved) {
      showToast('✓ Đã thu hồi quyền xem tab và gỡ quyền Google Drive của email này', 'success')
    } else {
      const hint = DRIVE_ERROR_HINTS[data.driveError] || data.driveError || 'lý do không rõ'
      showToast(
        `✓ Đã thu hồi quyền trên web. Chưa gỡ được Drive (${hint}) — cần vào Drive bỏ chia sẻ tay.`,
        'error'
      )
    }
    return true
  } catch (err) {
    console.error(err)
    showToast('❌ ' + (err.message || 'Lỗi khi thu hồi quyền'), 'error')
    return false
  }
}
