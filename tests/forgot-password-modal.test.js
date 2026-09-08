/**
 * initForgotPasswordModal (src/common.js) là helper dùng chung cho flow
 * "quên mật khẩu" ở cả login.js (member) và admin-login.js (admin). Test ở
 * đây thay cho việc lặp lại test tương tự trong tests/login.test.js và
 * tests/admin-login.test.js — chỉ cần test đúng 1 chỗ vì cả 2 trang dùng
 * chung implementation.
 *
 * Bất biến cần giữ (xem CLAUDE.md): message luôn giống hệt nhau dù email có
 * tồn tại hay không, và dù request tới Supabase thành công hay lỗi (chống
 * user enumeration — CWE-204).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    onAuthStateChange: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))

function renderModalFixture() {
  document.body.innerHTML = `
    <input id="login-email" />
    <button id="open-forgot-modal-btn"></button>
    <button id="close-forgot-modal-btn"></button>
    <button id="cancel-forgot-btn"></button>
    <div id="forgot-password-modal" class="hidden">
      <form id="forgot-form">
        <input id="forgot-email" />
        <button id="forgot-submit-btn"><span id="forgot-btn-text"></span><span id="forgot-btn-spinner" class="hidden"></span></button>
      </form>
      <div id="forgot-alert" class="hidden">
        <svg id="forgot-alert-icon"></svg>
        <span id="forgot-alert-text"></span>
      </div>
    </div>
  `
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  renderModalFixture()
})

const CONFIGS = [
  {
    label: 'member (login.js)',
    options: {
      prefillEmailInputId: 'login-email',
      redirectPath: '/reset-password.html',
      successMessage:
        'Nếu email này tồn tại trong hệ thống, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
      emptyEmailMessage: 'Vui lòng nhập địa chỉ email của bạn.',
      logPrefix: '[login]',
    },
  },
  {
    label: 'admin (admin-login.js)',
    options: {
      prefillEmailInputId: 'login-email',
      redirectPath: '/admin-reset-password.html',
      successMessage:
        'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).',
      emptyEmailMessage: 'Vui lòng nhập địa chỉ email quản trị.',
      logPrefix: '[admin-login]',
    },
  },
]

describe.each(CONFIGS)('initForgotPasswordModal — $label', ({ options }) => {
  it('hiện message thành công y hệt khi resetPasswordForEmail thành công', async () => {
    const { initForgotPasswordModal } = await import('../src/common.js')
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    initForgotPasswordModal(options)

    document.getElementById('forgot-email').value = 'exists@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(options.successMessage)
  })

  it('hiện ĐÚNG message y hệt khi resetPasswordForEmail lỗi (không lộ chi tiết lỗi ra ngoài)', async () => {
    const { initForgotPasswordModal } = await import('../src/common.js')
    mockSupabase.auth.resetPasswordForEmail.mockRejectedValue(new Error('boom'))
    initForgotPasswordModal(options)

    document.getElementById('forgot-email').value = 'notexists@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(options.successMessage)
  })

  it('redirectTo đúng trang tương ứng', async () => {
    const { initForgotPasswordModal } = await import('../src/common.js')
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    initForgotPasswordModal(options)

    document.getElementById('forgot-email').value = 'exists@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'exists@example.com',
      expect.objectContaining({ redirectTo: expect.stringContaining(options.redirectPath) })
    )
  })
})
