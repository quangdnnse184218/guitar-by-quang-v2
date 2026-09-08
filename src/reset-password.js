/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — RESET PASSWORD CONTROLLER (reset-password.js)
 * ==============================================================================
 */

import { initPasswordToggles, initPasswordResetForm } from './common.js'
import { initThemeToggle } from './theme-toggle.js'

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()
  initPasswordToggles()

  initPasswordResetForm({
    formId: 'reset-password-form',
    defaultAccountLabel: 'Tài khoản hợp lệ',
    loadingButtonText: 'Đang lưu mật khẩu...',
    idleButtonText: 'Lưu Mật Khẩu Mới',
    successMessage: 'Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...',
    redirectPath: '/login.html',
    logPrefix: '[reset-password]',
  })
})
