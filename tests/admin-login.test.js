/**
 * Test cho bất biến bảo mật ở cổng admin (admin-login.js): tài khoản hợp lệ
 * nhưng không có quyền admin phải bị từ chối và đăng xuất.
 *
 * Flow "quên mật khẩu quản trị" được test riêng ở
 * tests/forgot-password-modal.test.js vì logic đó nằm chung trong
 * initForgotPasswordModal (src/common.js), dùng lại cho cả login.js và
 * admin-login.js — ở đây chỉ mock nó làm no-op.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
  from: vi.fn(),
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))
vi.mock('../src/common.js', () => ({
  initPasswordToggles: vi.fn(),
  initForgotPasswordModal: vi.fn(),
}))

function mockProfileRole(role) {
  mockSupabase.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: role ? { role } : null }),
      }),
    }),
  })
}

function renderAdminLoginPage() {
  document.body.innerHTML = `
    <form id="admin-login-form">
      <input id="admin-email" />
      <input id="admin-password" />
      <button id="login-submit-btn"><span id="btn-text"></span><span id="btn-spinner" class="hidden"></span></button>
    </form>
    <div id="login-error" class="hidden"><span id="login-error-text"></span></div>
  `
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

// admin-login.js đệm mọi nhánh thất bại về cùng một mốc thời gian tối
// thiểu (AUTH_RESPONSE_FLOOR_MS = 900ms) trước khi hiện thông báo —
// flushPromises() bình thường (đợi đúng 1 tick) không đủ để thông báo đó
// kịp hiện ra.
function flushAuthFloor() {
  return new Promise((resolve) => setTimeout(resolve, 950))
}

async function loadAdminLoginModule() {
  renderAdminLoginPage()
  await import('../src/admin-login.js')
  await flushPromises()
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mockSupabase.auth.signOut.mockResolvedValue({ error: null })
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
})

describe('admin-login.js — chặn tài khoản không phải admin', () => {
  it('đăng xuất và từ chối khi tài khoản hợp lệ nhưng role không phải admin', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'x' }, user: { id: 'user-1' } },
      error: null,
    })
    mockProfileRole('user')
    await loadAdminLoginModule()

    document.getElementById('admin-email').value = 'member@example.com'
    document.getElementById('admin-password').value = 'correct-password'
    document
      .getElementById('admin-login-form')
      .dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()
    await flushAuthFloor()

    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
    // Cùng thông báo chung với "sai mật khẩu" — không được để lộ riêng
    // "tài khoản đúng nhưng không phải admin" qua nội dung message (đã vá,
    // xem commit fix "chặn lộ thông tin xác thực qua trang đăng nhập admin").
    expect(document.getElementById('login-error-text').textContent).toBe(
      'Email hoặc mật khẩu không chính xác. Vui lòng thử lại!'
    )
  })
})
