/**
 * Test cho 2 bất biến bảo mật ở cổng member (login.js) được ghi trong CLAUDE.md:
 * 1. Message ở flow "quên mật khẩu" phải giống hệt nhau dù email tồn tại hay
 *    không (chống user enumeration — CWE-204).
 * 2. Tài khoản admin không được đăng nhập qua cổng member, và message từ chối
 *    phải giống hệt message "sai mật khẩu" (không được để lộ đây là tài khoản
 *    admin qua nội dung thông báo).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))

function mockProfileRole(role) {
  mockSupabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: role ? { role } : null }),
      }),
    }),
  })
}

function renderLoginPage() {
  document.body.innerHTML = `
    <form id="login-form">
      <input id="login-email" />
      <input id="login-password" />
      <button id="login-submit-btn"><span id="btn-text"></span><span id="btn-spinner" class="hidden"></span></button>
    </form>
    <div id="login-alert" class="hidden">
      <svg id="login-alert-icon"></svg>
      <span id="login-alert-text"></span>
    </div>
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

// login.js bọc toàn bộ logic trong 1 listener DOMContentLoaded gắn thẳng vào
// `document`. Vì jsdom `document` dùng chung giữa các test trong cùng file,
// nếu dispatch DOMContentLoaded thật thì các listener từ những lần import
// trước (chưa bị gỡ) sẽ CỘNG DỒN và cùng chạy lại — khiến signOut/showAlert
// bị gọi nhiều lần hơn dự kiến. Thay vì dispatch thật, ta chặn
// addEventListener để lấy đúng callback rồi gọi trực tiếp, không đăng ký gì
// lên document cả — tránh tích lũy qua các lần import.
async function loadLoginModule() {
  renderLoginPage()
  let capturedHandler
  const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'DOMContentLoaded') capturedHandler = listener
  })
  await import('../src/login.js')
  addSpy.mockRestore()
  await capturedHandler()
  await flushPromises()
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockSupabase.auth.signOut.mockResolvedValue({ error: null })
})

describe('login.js — forgot password (chống user enumeration)', () => {
  it('hiện message thành công chung chung khi resetPasswordForEmail thành công', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await loadLoginModule()

    document.getElementById('forgot-email').value = 'exists@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(
      'Nếu email này tồn tại trong hệ thống, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).'
    )
  })

  it('hiện ĐÚNG message y hệt khi resetPasswordForEmail lỗi (không lộ chi tiết lỗi/email không tồn tại)', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockRejectedValue(new Error('User not found'))
    await loadLoginModule()

    document.getElementById('forgot-email').value = 'notexists@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(
      'Nếu email này tồn tại trong hệ thống, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).'
    )
  })
})

describe('login.js — chặn admin đăng nhập ở cổng member', () => {
  it('khoá session và hiện message giống hệt message "sai mật khẩu" khi tài khoản là admin', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'x' }, user: { id: 'admin-1' } },
      error: null,
    })
    mockProfileRole('admin')
    await loadLoginModule()

    document.getElementById('login-email').value = 'admin@example.com'
    document.getElementById('login-password').value = 'correct-admin-password'
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(document.getElementById('login-alert-text').textContent).toBe(
      'Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.'
    )
  })

  it('message admin-bị-chặn phải giống hệt message khi sai mật khẩu thật sự', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' },
    })
    await loadLoginModule()

    document.getElementById('login-email').value = 'user@example.com'
    document.getElementById('login-password').value = 'wrong-password'
    document.getElementById('login-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('login-alert-text').textContent).toBe(
      'Sai email hoặc mật khẩu. Vui lòng kiểm tra lại.'
    )
  })
})
