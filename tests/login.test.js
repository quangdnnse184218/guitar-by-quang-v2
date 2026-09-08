/**
 * Test cho bất biến bảo mật ở cổng member (login.js) được ghi trong CLAUDE.md:
 * tài khoản admin không được đăng nhập qua cổng member, và message từ chối
 * phải giống hệt message "sai mật khẩu" (không được để lộ đây là tài khoản
 * admin qua nội dung thông báo).
 *
 * Flow "quên mật khẩu" được test riêng ở tests/forgot-password-modal.test.js
 * vì logic đó nằm chung trong initForgotPasswordModal (src/common.js), dùng
 * lại cho cả login.js và admin-login.js — ở đây chỉ mock nó làm no-op.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  from: vi.fn(),
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))
vi.mock('../src/common.js', () => ({ initForgotPasswordModal: vi.fn() }))

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
  `
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
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

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockSupabase.auth.signOut.mockResolvedValue({ error: null })
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
