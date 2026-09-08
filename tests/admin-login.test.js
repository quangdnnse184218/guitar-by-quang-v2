/**
 * Test cho bất biến bảo mật ở cổng admin (admin-login.js): message ở flow
 * "quên mật khẩu quản trị" phải giống hệt nhau dù email có tồn tại hay có
 * quyền admin hay không (chống user/admin enumeration — CWE-204).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  },
  from: vi.fn(),
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))
vi.mock('../src/common.js', () => ({ initPasswordToggles: vi.fn() }))

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

describe('admin-login.js — forgot password (chống user/admin enumeration)', () => {
  it('hiện message thành công chung chung khi resetPasswordForEmail thành công', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    await loadAdminLoginModule()

    document.getElementById('forgot-email').value = 'admin@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(
      'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).'
    )
  })

  it('hiện ĐÚNG message y hệt khi resetPasswordForEmail lỗi (kể cả rate-limit không được lộ ra ngoài)', async () => {
    mockSupabase.auth.resetPasswordForEmail.mockRejectedValue(new Error('rate limit exceeded'))
    await loadAdminLoginModule()

    document.getElementById('forgot-email').value = 'not-an-admin@example.com'
    document.getElementById('forgot-form').dispatchEvent(new Event('submit', { cancelable: true }))
    await flushPromises()

    expect(document.getElementById('forgot-alert-text').textContent).toBe(
      'Nếu email này tồn tại trong hệ thống và có quyền Quản trị viên, một liên kết khôi phục mật khẩu đã được gửi tới hộp thư. Vui lòng kiểm tra email (kể cả mục Spam).'
    )
  })
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

    expect(mockSupabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(document.getElementById('login-error-text').textContent).toBe(
      'Tài khoản này không có quyền truy cập Admin.'
    )
  })
})
