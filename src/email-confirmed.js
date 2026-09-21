/**
 * Trang đích của liên kết "Xác nhận email" (emailRedirectTo của signUp/resend).
 *
 * Lúc khách bấm liên kết, Supabase ĐÃ đánh dấu email được xác thực ở phía máy chủ rồi mới chuyển
 * tới đây — trang này chỉ báo kết quả cho khách, và nhắn cho trang đăng ký (đang chờ ở tab/thiết
 * bị khác) biết để tự đăng nhập. Vì vậy trang này KHÔNG tạo phiên đăng nhập gì cả: không nạp
 * client Supabase ở trường hợp thành công, và xoá phần token trên thanh địa chỉ ngay.
 */
import { initThemeToggle } from './theme-toggle.js'

/**
 * Đọc kết quả từ địa chỉ trang. Supabase gắn thông tin vào phần sau dấu `#` (luồng implicit) hoặc
 * sau dấu `?` (luồng PKCE), lỗi thì là `error=access_denied&error_code=otp_expired…`.
 * @returns {'success' | 'error' | 'none'}
 */
export function readConfirmationState(hash = '', search = '') {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''))
  for (const [k, v] of new URLSearchParams(String(search).replace(/^\?/, ''))) params.set(k, v)

  if (params.has('error') || params.has('error_code') || params.has('error_description')) {
    return 'error'
  }
  if (
    params.has('access_token') ||
    params.has('refresh_token') ||
    params.has('code') ||
    params.get('type') === 'signup'
  ) {
    return 'success'
  }
  return 'none'
}

function show(id) {
  ;['state-success', 'state-error', 'state-none'].forEach((s) => {
    document.getElementById(s)?.classList.toggle('hidden', s !== id)
  })
}

function initResendForm() {
  const form = document.getElementById('resend-form')
  const emailInput = document.getElementById('resend-email')
  const btn = document.getElementById('resend-btn')
  const feedback = document.getElementById('resend-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = emailInput.value.trim()
    if (!email) return
    btn.disabled = true
    feedback.classList.remove('hidden')
    feedback.textContent = 'Đang gửi…'
    try {
      // Chỉ nạp client Supabase khi thật sự cần (trường hợp lỗi), để trang thành công không tạo phiên.
      const { supabase } = await import('./lib/supabase.js')
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/email-confirmed.html` },
      })
    } catch {
      // Cố ý không lộ kết quả: thông báo bên dưới giống hệt nhau dù email có tồn tại hay không.
    }
    feedback.textContent =
      'Nếu email này đang chờ xác nhận, chúng tôi đã gửi lại thư. Hãy kiểm tra hộp thư (cả mục Spam).'
    setTimeout(() => (btn.disabled = false), 60_000)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()

  const state = readConfirmationState(window.location.hash, window.location.search)
  show(state === 'success' ? 'state-success' : state === 'error' ? 'state-error' : 'state-none')

  // Xoá token/mã lỗi khỏi thanh địa chỉ (không để lại trong lịch sử trình duyệt hay ảnh chụp màn hình).
  if (window.location.hash || window.location.search) {
    window.history.replaceState(null, '', window.location.pathname)
  }

  if (state === 'success' && typeof BroadcastChannel !== 'undefined') {
    // Trang đăng ký đang mở ở CÙNG trình duyệt sẽ đăng nhập ngay; khác thiết bị thì nó tự hỏi định kỳ.
    const channel = new BroadcastChannel('gbq-auth')
    channel.postMessage({ type: 'email-confirmed' })
    setTimeout(() => channel.close(), 500)
  }

  if (state === 'error') initResendForm()
})
