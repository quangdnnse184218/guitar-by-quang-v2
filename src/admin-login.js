/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN LOGIN CONTROLLER (admin-login.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles, initForgotPasswordModal } from './common.js'

initThemeToggle()
initPasswordToggles()

const loginForm = document.getElementById('admin-login-form')
const emailInput = document.getElementById('admin-email')
const passwordInput = document.getElementById('admin-password')
const submitBtn = document.getElementById('login-submit-btn')
const btnText = document.getElementById('btn-text')
const btnSpinner = document.getElementById('btn-spinner')
const errorBox = document.getElementById('login-error')
const errorText = document.getElementById('login-error-text')

initForgotPasswordModal({
  prefillEmailInputId: 'admin-email',
  redirectPath: '/admin-reset-password.html',
  successMessage:
    'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
  emptyEmailMessage: 'Vui lòng nhập địa chỉ email quản trị.',
  logPrefix: '[admin-login]',
})

function showError(msg) {
  if (!errorBox || !errorText) return
  errorText.textContent = msg
  errorBox.classList.remove('hidden')
}

function hideError() {
  if (errorBox) errorBox.classList.add('hidden')
}

function setLoading(isLoading) {
  if (!submitBtn) return
  submitBtn.disabled = isLoading
  if (isLoading) {
    if (btnText) btnText.textContent = 'Đang xác thực...'
    if (btnSpinner) btnSpinner.classList.remove('hidden')
  } else {
    if (btnText) btnText.textContent = 'Đăng Nhập Vào Dashboard →'
    if (btnSpinner) btnSpinner.classList.add('hidden')
  }
}

async function checkExistingSession() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session && session.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

      if (profile?.role === 'admin') {
        window.location.replace('/admin-dashboard.html')
      }
    }
  } catch (err) {
    console.warn('[admin-login] Session check error:', err)
  }
}

// Form đăng nhập admin cũng có novalidate nên type="email" không tự chặn gì
// — kiểm tra định dạng ở đây, giống login.js/register.js.
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

// Cùng vấn đề chênh lệch thời gian như login.js: nhánh "sai mật khẩu" dừng
// ngay sau 1 lệnh gọi, còn nhánh "đúng mật khẩu nhưng không phải admin" phải
// gọi thêm 2 lệnh (đọc role + signOut) trước khi hiện CÙNG một thông báo —
// đệm về cùng mốc thời gian tối thiểu để không lộ qua độ trễ phản hồi.
const AUTH_RESPONSE_FLOOR_MS = 900

async function padToFloor(startedAt) {
  const elapsed = Date.now() - startedAt
  if (elapsed < AUTH_RESPONSE_FLOOR_MS) {
    await new Promise((resolve) => setTimeout(resolve, AUTH_RESPONSE_FLOOR_MS - elapsed))
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideError()

    const email = emailInput?.value?.trim()
    const password = passwordInput?.value

    if (!email || !password) {
      showError('Vui lòng nhập đầy đủ Email và Mật khẩu!')
      return
    }

    if (!emailRegex.test(email)) {
      emailInput?.focus()
      showError('Địa chỉ Email không đúng định dạng (Ví dụ đúng: tenban@gmail.com).')
      return
    }

    setLoading(true)
    const startedAt = Date.now()

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      // Luôn hiện đúng MỘT thông báo lỗi chung cho mọi trường hợp thất bại —
      // kể cả khi Supabase trả lỗi cụ thể hơn (vd "Email not confirmed" nghĩa
      // là email/mật khẩu ĐÚNG nhưng tài khoản chưa xác nhận email) hay khi
      // đăng nhập đúng nhưng tài khoản không phải admin. Trước đây 2 trường
      // hợp này hiện thông báo khác — vô tình biến trang admin-login thành
      // "máy dò" cho kẻ tấn công dò danh sách email/mật khẩu rò rỉ: biết
      // được cặp nào ĐÚNG (dù không phải admin) mà không cần đăng nhập thử ở
      // cổng thành viên. Cùng nguyên tắc chống lộ danh tính admin đã áp dụng
      // ở login.js, áp dụng ngược lại ở đây.
      const GENERIC_FAIL_MSG = 'Email hoặc mật khẩu không chính xác. Vui lòng thử lại!'

      if (error) {
        await padToFloor(startedAt)
        showError(GENERIC_FAIL_MSG)
        setLoading(false)
        return
      }

      if (data?.session && data?.user) {
        // Verify admin role in profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', data.user.id)
          .single()

        const isAdmin = profile?.role === 'admin'

        if (!isAdmin) {
          await supabase.auth.signOut()
          await padToFloor(startedAt)
          showError(GENERIC_FAIL_MSG)
          setLoading(false)
          return
        }

        window.location.replace('/admin-dashboard.html')
      } else {
        await padToFloor(startedAt)
        showError(GENERIC_FAIL_MSG)
        setLoading(false)
      }
    } catch (err) {
      await padToFloor(startedAt)
      showError('Lỗi kết nối máy chủ xác thực. Vui lòng kiểm tra lại mạng!')
      setLoading(false)
    }
  })
}

document.addEventListener('DOMContentLoaded', checkExistingSession)
