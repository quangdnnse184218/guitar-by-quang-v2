/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN RESET PASSWORD CONTROLLER (admin-reset-password.js)
 * ==============================================================================
 */

import { initPasswordToggles, initPasswordResetForm } from './common.js'
import { initThemeToggle } from './theme-toggle.js'

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()
  initPasswordToggles()

  initPasswordResetForm({
    formId: 'admin-reset-password-form',
    defaultAccountLabel: 'Tài khoản Admin hợp lệ',
    loadingButtonText: 'Đang lưu mật khẩu Admin...',
    idleButtonText: 'Lưu Mật Khẩu Quản Trị',
    successMessage:
      'Đặt lại mật khẩu Admin thành công! Đang chuyển hướng về trang đăng nhập Quản trị...',
    redirectPath: '/admin-login.html',
    logPrefix: '[admin-reset-password]',
  })
})
