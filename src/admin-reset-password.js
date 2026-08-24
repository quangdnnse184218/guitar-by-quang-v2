/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN RESET PASSWORD CONTROLLER (admin-reset-password.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initPasswordToggles } from './common.js'
import { initThemeToggle } from './theme-toggle.js'

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle()
  initPasswordToggles()

  const form = document.getElementById('admin-reset-password-form')
  const newPasswordInput = document.getElementById('new-password')
  const confirmPasswordInput = document.getElementById('confirm-password')
  const submitBtn = document.getElementById('reset-submit-btn')
  const btnText = document.getElementById('btn-text')
  const btnSpinner = document.getElementById('btn-spinner')
  
  const alertBox = document.getElementById('reset-alert')
  const alertText = document.getElementById('reset-alert-text')
  const alertIcon = document.getElementById('reset-alert-icon')

  const accountEmailSpan = document.getElementById('account-email')

  function setAccountEmail(email) {
    if (accountEmailSpan) {
      accountEmailSpan.textContent = email || 'Tài khoản Admin hợp lệ'
    }
  }

  function showAlert(message, isSuccess = false) {
    if (!alertBox || !alertText) return
    alertBox.classList.remove('hidden')
    alertText.textContent = message
    
    if (isSuccess) {
      alertBox.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      alertBox.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add('hidden')
  }

  function setLoading(isLoading) {
    if (!submitBtn) return
    submitBtn.disabled = isLoading
    if (isLoading) {
      submitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = 'Đang lưu mật khẩu Admin...'
      if (btnSpinner) btnSpinner.classList.remove('hidden')
    } else {
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = 'Lưu Mật Khẩu Quản Trị'
      if (btnSpinner) btnSpinner.classList.add('hidden')
    }
  }

  // Check URL hash / search params for Supabase error messages
  const hashParams = new URLSearchParams(window.location.hash.substring(1))
  const searchParams = new URLSearchParams(window.location.search)
  const errorDescription = hashParams.get('error_description') || searchParams.get('error_description')

  if (errorDescription) {
    showAlert(`Liên kết không hợp lệ hoặc đã hết hạn: ${decodeURIComponent(errorDescription.replace(/\+/g, ' '))}`)
    setLoading(true)
    submitBtn.style.display = 'none'
    if (accountEmailSpan) accountEmailSpan.textContent = 'Không hợp lệ'
    return
  }

  // Listen for Supabase Password Recovery event
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' || session?.user) {
      console.log('[admin-reset-password] Auth event:', event)
      if (session?.user?.email) {
        setAccountEmail(session.user.email)
      }
    }
  })

  // Verify if session exists
  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        setAccountEmail(session.user.email)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setAccountEmail(user.email)
        return
      }

      // Small retry for hash parsing
      setTimeout(async () => {
        const { data: { session: s2 } } = await supabase.auth.getSession()
        if (s2?.user?.email) {
          setAccountEmail(s2.user.email)
        } else if (!window.location.hash.includes('access_token')) {
          setAccountEmail('Chưa xác thực')
          showAlert('Vui lòng mở liên kết đặt lại mật khẩu từ email của bạn để tiếp tục.')
        }
      }, 1000)
    } catch (err) {
      console.warn('[admin-reset-password] Session check error:', err)
    }
  }

  checkSession()

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideAlert()

      const newPassword = newPasswordInput?.value
      const confirmPassword = confirmPasswordInput?.value

      if (!newPassword || !confirmPassword) {
        return showAlert('Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.')
      }

      if (newPassword.length < 6) {
        return showAlert('Mật khẩu mới phải có tối thiểu 6 ký tự.')
      }

      if (newPassword !== confirmPassword) {
        return showAlert('Xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại.')
      }

      setLoading(true)

      try {
        const { data, error } = await supabase.auth.updateUser({
          password: newPassword
        })

        if (error) throw error

        showAlert('Đặt lại mật khẩu Admin thành công! Đang chuyển hướng về trang đăng nhập Quản trị...', true)
        
        // Auto logout to ensure clean state
        try {
          await supabase.auth.signOut()
        } catch (_) {}

        setTimeout(() => {
          window.location.href = '/admin-login.html'
        }, 1500)

      } catch (err) {
        console.error('[admin-reset-password] Update password error:', err)
        let msg = 'Không thể đặt lại mật khẩu. Vui lòng yêu cầu gửi lại email mới.'
        if (err.message) {
          if (err.message.includes('Auth session missing')) {
            msg = 'Phiên khôi phục đã hết hạn. Vui lòng gửi lại yêu cầu quên mật khẩu.'
          } else {
            msg = `Lỗi: ${err.message}`
          }
        }
        showAlert(msg)
      } finally {
        setLoading(false)
      }
    })
  }
})
