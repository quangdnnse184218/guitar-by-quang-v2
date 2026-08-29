/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN LOGIN CONTROLLER (admin-login.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles } from './common.js'

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

// Forgot Password Elements
const openForgotBtn = document.getElementById('open-forgot-modal-btn')
const closeForgotBtn = document.getElementById('close-forgot-modal-btn')
const cancelForgotBtn = document.getElementById('cancel-forgot-btn')
const forgotModal = document.getElementById('forgot-password-modal')
const forgotForm = document.getElementById('forgot-form')
const forgotEmailInput = document.getElementById('forgot-email')
const forgotSubmitBtn = document.getElementById('forgot-submit-btn')
const forgotBtnText = document.getElementById('forgot-btn-text')
const forgotBtnSpinner = document.getElementById('forgot-btn-spinner')
const forgotAlert = document.getElementById('forgot-alert')
const forgotAlertText = document.getElementById('forgot-alert-text')
const forgotAlertIcon = document.getElementById('forgot-alert-icon')

function showError(msg) {
  if (!errorBox || !errorText) return
  errorText.textContent = msg
  errorBox.classList.remove('hidden')
}

function hideError() {
  if (errorBox) errorBox.classList.add('hidden')
}

function showForgotAlert(message, isSuccess = false) {
  if (!forgotAlert || !forgotAlertText) return
  forgotAlert.classList.remove('hidden')
  forgotAlertText.textContent = message

  if (isSuccess) {
    forgotAlert.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
    if (forgotAlertIcon) {
      forgotAlertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
      forgotAlertIcon.classList.replace('text-rose-500', 'text-emerald-500')
    }
  } else {
    forgotAlert.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
    if (forgotAlertIcon) {
      forgotAlertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
      forgotAlertIcon.classList.replace('text-emerald-500', 'text-rose-500')
    }
  }
}

function hideForgotAlert() {
  if (forgotAlert) forgotAlert.classList.add('hidden')
}

function setForgotLoading(isLoading) {
  if (!forgotSubmitBtn) return
  forgotSubmitBtn.disabled = isLoading
  if (isLoading) {
    forgotSubmitBtn.classList.add('opacity-70', 'cursor-not-allowed')
    if (forgotBtnText) forgotBtnText.textContent = 'Đang gửi email...'
    if (forgotBtnSpinner) forgotBtnSpinner.classList.remove('hidden')
  } else {
    forgotSubmitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
    if (forgotBtnText) forgotBtnText.textContent = 'Gửi Liên Kết Khôi Phục'
    if (forgotBtnSpinner) forgotBtnSpinner.classList.add('hidden')
  }
}

function openForgotModal() {
  if (!forgotModal) return
  hideForgotAlert()
  if (emailInput && forgotEmailInput && emailInput.value.trim()) {
    forgotEmailInput.value = emailInput.value.trim()
  }
  forgotModal.classList.remove('hidden')
}

function closeForgotModal() {
  if (!forgotModal) return
  forgotModal.classList.add('hidden')
  hideForgotAlert()
}

if (openForgotBtn) openForgotBtn.addEventListener('click', openForgotModal)
if (closeForgotBtn) closeForgotBtn.addEventListener('click', closeForgotModal)
if (cancelForgotBtn) cancelForgotBtn.addEventListener('click', closeForgotModal)

if (forgotModal) {
  forgotModal.addEventListener('click', (e) => {
    if (e.target === forgotModal) closeForgotModal()
  })
}

// Forgot Form Submit
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    hideForgotAlert()

    const email = forgotEmailInput?.value?.trim()
    if (!email) {
      return showForgotAlert('Vui lòng nhập địa chỉ email quản trị.')
    }

    // Kiểm tra định dạng email chuẩn
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    if (!emailRegex.test(email)) {
      return showForgotAlert('Gửi thất bại: Địa chỉ email không đúng định dạng hoặc sai tên email. Vui lòng kiểm tra lại.')
    }

    setForgotLoading(true)

    try {
      // Gửi yêu cầu reset password qua Supabase Auth
      // KHÔNG kiểm tra email có tồn tại hay có phải admin trước khi gửi —
      // tránh lộ thông tin (user enumeration). Luôn trả về thông báo chung chung
      // bất kể email có tồn tại/có quyền admin hay không.
      const redirectTo = `${window.location.origin}/admin-reset-password.html`

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      })

      // Luôn hiện thông báo thành công chung chung, kể cả khi có lỗi rate-limit
      // ẩn bên trong (rate-limit cũng không nên tiết lộ ra ngoài để tránh dò email).
      showForgotAlert(
        'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
        true
      )

      if (forgotEmailInput) forgotEmailInput.value = ''

    } catch (err) {
      // Chỉ log lỗi ra console để debug, KHÔNG hiện chi tiết lỗi thật cho người dùng
      console.error('[admin-login] Reset password error:', err)
      showForgotAlert(
        'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
        true
      )
    } finally {
      setForgotLoading(false)
    }
  })
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
    const { data: { session } } = await supabase.auth.getSession()
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

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          showError('Email hoặc mật khẩu không chính xác. Vui lòng thử lại!')
        } else {
          showError(`Đăng nhập thất bại: ${error.message}`)
        }
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
          showError('Tài khoản này không có quyền truy cập Admin.')
          setLoading(false)
          return
        }

        window.location.replace('/admin-dashboard.html')
      } else {
        showError('Không nhận được phiên đăng nhập hợp lệ.')
        setLoading(false)
      }
    } catch (err) {
      showError('Lỗi kết nối máy chủ xác thực. Vui lòng kiểm tra lại mạng!')
      setLoading(false)
    }
  })
}

document.addEventListener('DOMContentLoaded', checkExistingSession)

