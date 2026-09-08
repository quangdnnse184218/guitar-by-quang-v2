/**
 * initPasswordResetForm (src/common.js) là helper dùng chung cho
 * reset-password.js (member) và admin-reset-password.js (admin) — trước đây
 * 2 file gần như copy-paste y hệt nhau. Test ở đây thay cho việc lặp lại test
 * tương tự ở 2 nơi.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    onAuthStateChange: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    updateUser: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))

function renderFormFixture(formId) {
  document.body.innerHTML = `
    <span id="account-email"></span>
    <form id="${formId}">
      <input id="new-password" />
      <input id="confirm-password" />
      <button id="reset-submit-btn"><span id="btn-text"></span><span id="btn-spinner" class="hidden"></span></button>
    </form>
    <div id="reset-alert" class="hidden">
      <svg id="reset-alert-icon"></svg>
      <span id="reset-alert-text"></span>
    </div>
  `
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function submitForm(formId, { newPassword, confirmPassword }) {
  document.getElementById('new-password').value = newPassword
  document.getElementById('confirm-password').value = confirmPassword
  document.getElementById(formId).dispatchEvent(new Event('submit', { cancelable: true }))
}

const CONFIGS = [
  {
    label: 'member (reset-password.js)',
    options: {
      formId: 'reset-password-form',
      defaultAccountLabel: 'Tài khoản hợp lệ',
      loadingButtonText: 'Đang lưu mật khẩu...',
      idleButtonText: 'Lưu Mật Khẩu Mới',
      successMessage: 'Đặt lại mật khẩu thành công! Đang chuyển hướng về trang đăng nhập...',
      redirectPath: '/login.html',
      logPrefix: '[reset-password]',
    },
  },
  {
    label: 'admin (admin-reset-password.js)',
    options: {
      formId: 'admin-reset-password-form',
      defaultAccountLabel: 'Tài khoản Admin hợp lệ',
      loadingButtonText: 'Đang lưu mật khẩu Admin...',
      idleButtonText: 'Lưu Mật Khẩu Quản Trị',
      successMessage:
        'Đặt lại mật khẩu Admin thành công! Đang chuyển hướng về trang đăng nhập Quản trị...',
      redirectPath: '/admin-login.html',
      logPrefix: '[admin-reset-password]',
    },
  },
]

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } })
  mockSupabase.auth.signOut.mockResolvedValue({ error: null })
})

describe.each(CONFIGS)('initPasswordResetForm — $label', ({ options }) => {
  it('từ chối khi 2 mật khẩu không khớp', async () => {
    renderFormFixture(options.formId)
    const { initPasswordResetForm } = await import('../src/common.js')
    initPasswordResetForm(options)

    submitForm(options.formId, { newPassword: 'abcdef', confirmPassword: 'ghijkl' })
    await flushPromises()

    expect(document.getElementById('reset-alert-text').textContent).toBe(
      'Xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại.'
    )
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('từ chối khi mật khẩu ngắn hơn 6 ký tự', async () => {
    renderFormFixture(options.formId)
    const { initPasswordResetForm } = await import('../src/common.js')
    initPasswordResetForm(options)

    submitForm(options.formId, { newPassword: 'abc', confirmPassword: 'abc' })
    await flushPromises()

    expect(document.getElementById('reset-alert-text').textContent).toBe(
      'Mật khẩu mới phải có tối thiểu 6 ký tự.'
    )
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled()
  })

  it('cập nhật thành công: hiện đúng successMessage và tự đăng xuất', async () => {
    renderFormFixture(options.formId)
    mockSupabase.auth.updateUser.mockResolvedValue({ data: {}, error: null })
    const { initPasswordResetForm } = await import('../src/common.js')
    initPasswordResetForm(options)

    submitForm(options.formId, { newPassword: 'new-secure-pass', confirmPassword: 'new-secure-pass' })
    await flushPromises()

    expect(document.getElementById('reset-alert-text').textContent).toBe(options.successMessage)
    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('báo phiên hết hạn khi updateUser lỗi "Auth session missing"', async () => {
    renderFormFixture(options.formId)
    mockSupabase.auth.updateUser.mockRejectedValue(new Error('Auth session missing'))
    const { initPasswordResetForm } = await import('../src/common.js')
    initPasswordResetForm(options)

    submitForm(options.formId, { newPassword: 'new-secure-pass', confirmPassword: 'new-secure-pass' })
    await flushPromises()

    expect(document.getElementById('reset-alert-text').textContent).toBe(
      'Phiên khôi phục đã hết hạn. Vui lòng gửi lại yêu cầu quên mật khẩu.'
    )
  })
})
