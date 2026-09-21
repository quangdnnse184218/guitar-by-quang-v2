/**
 * Luồng "đăng ký → chờ xác nhận email → tự đăng nhập" của register.js.
 * Dùng đúng HTML thật của register.html để chắc các id trong code và trang khớp nhau.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    resend: vi.fn(),
  },
  functions: { invoke: vi.fn() },
  from: vi.fn(),
}
const redirectTo = vi.fn()

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))
vi.mock('../src/common.js', () => ({
  getPasswordWeaknessReason: vi.fn(() => null),
  initPasswordMatchHint: vi.fn(),
}))
vi.mock('../src/lib/navigate.js', () => ({ redirectTo }))

const html = fs.readFileSync(path.resolve(import.meta.dirname, '../register.html'), 'utf8')

/** BroadcastChannel giả để điều khiển tin nhắn từ "tab xác nhận". */
const channels = []
const trackedListeners = []
class FakeChannel {
  constructor(name) {
    this.name = name
    this.closed = false
    channels.push(this)
  }
  close() {
    this.closed = true
  }
}

const unconfirmed = { data: null, error: { message: 'Email not confirmed', status: 400 } }
const signedIn = { data: { session: { access_token: 't' } }, error: null }

function renderRegisterPage() {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  document.body.innerHTML = doc.body.innerHTML
}

function emptyProfileQuery() {
  return { select: () => ({ ilike: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }
}

async function loadRegisterModule() {
  renderRegisterPage()
  let capturedHandler
  const addSpy = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'DOMContentLoaded') capturedHandler = listener
  })
  await import('../src/register.js')
  addSpy.mockRestore()
  // Ghi nhận các listener trang thêm vào document về sau (visibilitychange) để dọn giữa các test:
  // trong thực tế mỗi lần mở trang là một document mới, còn jsdom thì dùng chung.
  vi.spyOn(document, 'addEventListener').mockImplementation(function (type, listener, opts) {
    if (type === 'visibilitychange') trackedListeners.push(listener)
    return EventTarget.prototype.addEventListener.call(this, type, listener, opts)
  })
  await capturedHandler()
}

async function submitForm({ email = 'khach@gmail.com', password = 'MatKhau123' } = {}) {
  document.getElementById('register-name').value = 'Khach Test'
  document.getElementById('register-email').value = email
  document.getElementById('register-password').value = password
  document.getElementById('register-confirm-password').value = password
  document.getElementById('register-form').dispatchEvent(new Event('submit', { cancelable: true }))
  await vi.advanceTimersByTimeAsync(0)
}

const $ = (id) => document.getElementById(id)
const isHidden = (id) => $(id).classList.contains('hidden')

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetModules()
  vi.clearAllMocks()
  channels.length = 0
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  mockSupabase.functions.invoke.mockResolvedValue({ data: { valid: true }, error: null })
  mockSupabase.from.mockImplementation(emptyProfileQuery)
  mockSupabase.auth.signUp.mockResolvedValue({
    data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
    error: null,
  })
  mockSupabase.auth.signInWithPassword.mockResolvedValue(unconfirmed)
  mockSupabase.auth.resend.mockResolvedValue({ error: null })
})

afterEach(() => {
  trackedListeners.splice(0).forEach((l) => document.removeEventListener('visibilitychange', l))
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('register.js — sau khi đăng ký thành công', () => {
  it('Ở NGUYÊN trang đăng ký: hiện khối chờ email, ẩn form, KHÔNG tự nhảy sang trang Đăng nhập', async () => {
    await loadRegisterModule()
    await submitForm()

    expect(isHidden('register-form')).toBe(true)
    expect(isHidden('register-waiting')).toBe(false)
    expect($('waiting-email').textContent).toBe('khach@gmail.com')

    await vi.advanceTimersByTimeAsync(10_000) // trước đây 3 giây là bị chuyển trang
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it('gửi kèm emailRedirectTo trỏ tới trang "đã xác thực thành công" của web', async () => {
    await loadRegisterModule()
    await submitForm()
    const opts = mockSupabase.auth.signUp.mock.calls[0][0].options
    expect(opts.emailRedirectTo).toBe(`${window.location.origin}/email-confirmed.html`)
  })

  it('xoá mật khẩu khỏi các ô nhập ngay khi chuyển sang chờ', async () => {
    await loadRegisterModule()
    await submitForm()
    expect($('register-password').value).toBe('')
    expect($('register-confirm-password').value).toBe('')
  })

  it('tự đăng nhập bằng đúng email + mật khẩu đã nhập khi khách xác nhận, rồi vào trang cá nhân', async () => {
    mockSupabase.auth.signInWithPassword
      .mockResolvedValueOnce(unconfirmed)
      .mockResolvedValueOnce(signedIn)
    await loadRegisterModule()
    await submitForm({ email: 'a@b.com', password: 'Abcdefg1' })

    await vi.advanceTimersByTimeAsync(12_000)
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'Abcdefg1',
    })
    expect(redirectTo).not.toHaveBeenCalled() // mới thử lần đầu, chưa xác nhận

    await vi.advanceTimersByTimeAsync(12_000)
    expect($('waiting-status-text').textContent).toMatch(/Đã xác nhận/)
    await vi.advanceTimersByTimeAsync(1000)
    expect(redirectTo).toHaveBeenCalledWith('/user-dashboard.html')
  })

  it('tab "đã xác thực" báo tin cùng trình duyệt → kiểm tra và đăng nhập NGAY, không chờ lượt hỏi kế', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue(signedIn)
    await loadRegisterModule()
    await submitForm()
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()

    const channel = channels.find((c) => c.name === 'gbq-auth')
    expect(channel).toBeTruthy()
    channel.onmessage({ data: { type: 'email-confirmed' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(redirectTo).toHaveBeenCalledWith('/user-dashboard.html')
  })

  it('tin nhắn lạ trên kênh không kích hoạt gì', async () => {
    await loadRegisterModule()
    await submitForm()
    channels.find((c) => c.name === 'gbq-auth').onmessage({ data: { type: 'khac' } })
    await vi.advanceTimersByTimeAsync(100)
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('khách quay lại tab (từ ứng dụng email) thì kiểm tra ngay', async () => {
    await loadRegisterModule()
    await submitForm()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1)
  })

  it('tab đang ẩn thì visibilitychange không gọi đăng nhập', async () => {
    await loadRegisterModule()
    await submitForm()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })

  it('sau khi đăng nhập được thì dừng hẳn: không hỏi thêm, đóng kênh', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue(signedIn)
    await loadRegisterModule()
    await submitForm()
    await vi.advanceTimersByTimeAsync(12_000)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(channels.every((c) => c.closed)).toBe(true)
  })

  it('tài khoản không cần xác nhận email (đã có phiên) thì vào thẳng trang cá nhân như cũ', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: { access_token: 'x' } },
      error: null,
    })
    await loadRegisterModule()
    await submitForm()
    expect(isHidden('register-waiting')).toBe(true)
    await vi.advanceTimersByTimeAsync(1300)
    expect(redirectTo).toHaveBeenCalledWith('/user-dashboard.html')
  })

  it('email đã đăng ký từ trước thì KHÔNG vào chế độ chờ', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [] }, session: null },
      error: null,
    })
    await loadRegisterModule()
    await submitForm()
    expect(isHidden('register-waiting')).toBe(true)
    expect(isHidden('register-form')).toBe(false)
    expect($('register-alert-text').textContent).toMatch(/đã được đăng ký/)
  })
})

describe('register.js — gửi lại email xác nhận', () => {
  it('nút bị khoá và đếm ngược 60 giây (Supabase chỉ cho gửi lại sau 60 giây)', async () => {
    await loadRegisterModule()
    await submitForm()
    const btn = $('waiting-resend-btn')
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('60s')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(btn.textContent).toContain('30s')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(btn.disabled).toBe(false)
    expect(btn.textContent).toBe('Gửi lại email xác nhận')
  })

  it('bấm gửi lại: gọi resend đúng loại + đường dẫn xác nhận, báo thành công, khoá nút 60 giây nữa', async () => {
    await loadRegisterModule()
    await submitForm({ email: 'gui@lai.com' })
    await vi.advanceTimersByTimeAsync(60_000)

    $('waiting-resend-btn').click()
    await vi.advanceTimersByTimeAsync(0)

    expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'gui@lai.com',
      options: { emailRedirectTo: `${window.location.origin}/email-confirmed.html` },
    })
    expect($('waiting-feedback').classList.contains('hidden')).toBe(false)
    expect($('waiting-feedback').textContent).toMatch(/Đã gửi lại email/)
    expect($('waiting-resend-btn').disabled).toBe(true)
  })

  it('bị giới hạn tốc độ thì báo thân thiện, không lộ chi tiết kỹ thuật', async () => {
    mockSupabase.auth.resend.mockResolvedValue({
      error: { message: 'For security purposes, you can only request this after 45 seconds.' },
    })
    await loadRegisterModule()
    await submitForm()
    await vi.advanceTimersByTimeAsync(60_000)
    $('waiting-resend-btn').click()
    await vi.advanceTimersByTimeAsync(0)
    expect($('waiting-feedback').textContent).toMatch(/đợi ít phút/)
    expect($('waiting-feedback').textContent).not.toMatch(/security purposes/i)
  })
})

describe('register.js — thông báo lỗi dành cho khách', () => {
  it('lỗi giới hạn gửi email KHÔNG được bảo khách tự tắt cài đặt Supabase', async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: null,
      error: { message: 'email rate limit exceeded' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await loadRegisterModule()
    await submitForm()
    const text = $('register-alert-text').textContent
    expect(text).toMatch(/thử lại sau ít phút/)
    expect(text).not.toMatch(/Supabase|TẮT|Confirm email/i)
  })
})
