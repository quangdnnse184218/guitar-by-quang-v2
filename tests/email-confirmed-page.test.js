import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const resend = vi.fn().mockResolvedValue({ error: null })
vi.mock('../src/lib/supabase.js', () => ({ supabase: { auth: { resend } } }))
vi.mock('../src/theme-toggle.js', () => ({ initThemeToggle: vi.fn() }))

import { readConfirmationState } from '../src/email-confirmed.js'

const html = fs.readFileSync(path.resolve(import.meta.dirname, '../email-confirmed.html'), 'utf8')
const $ = (id) => document.getElementById(id)

describe('readConfirmationState', () => {
  it('có token trong phần # (luồng implicit) → thành công', () => {
    expect(readConfirmationState('#access_token=abc&refresh_token=x&type=signup')).toBe('success')
  })
  it('có mã trong phần ? (luồng PKCE) → thành công', () => {
    expect(readConfirmationState('', '?code=abc123')).toBe('success')
  })
  it('type=signup một mình cũng tính là thành công', () => {
    expect(readConfirmationState('#type=signup')).toBe('success')
  })
  it('liên kết hết hạn / đã dùng → lỗi', () => {
    expect(
      readConfirmationState('#error=access_denied&error_code=otp_expired&error_description=x')
    ).toBe('error')
    expect(readConfirmationState('', '?error=access_denied')).toBe('error')
  })
  it('LỖI thắng khi có cả lỗi lẫn token (không báo thành công nhầm)', () => {
    expect(readConfirmationState('#access_token=abc&error=access_denied')).toBe('error')
  })
  it('mở thẳng trang không có gì → none', () => {
    expect(readConfirmationState('', '')).toBe('none')
    expect(readConfirmationState('#', '?')).toBe('none')
    expect(readConfirmationState('#foo=bar')).toBe('none')
  })
})

describe('trang email-confirmed', () => {
  const posted = []
  class FakeChannel {
    constructor(name) {
      this.name = name
    }
    postMessage(m) {
      posted.push({ name: this.name, m })
    }
    close() {}
  }

  async function open(hash, search = '') {
    vi.resetModules()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    document.body.innerHTML = doc.body.innerHTML
    window.history.replaceState(null, '', `/email-confirmed.html${search}${hash}`)
    let handler
    const spy = vi.spyOn(document, 'addEventListener').mockImplementation((t, l) => {
      if (t === 'DOMContentLoaded') handler = l
    })
    await import('../src/email-confirmed.js')
    spy.mockRestore()
    await handler()
  }

  beforeEach(() => {
    posted.length = 0
    resend.mockClear()
    vi.stubGlobal('BroadcastChannel', FakeChannel)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('thành công: hiện dòng "Đã xác thực thành công… quay lại trang web" và báo cho trang đăng ký', async () => {
    await open('#access_token=abc&type=signup')
    expect($('state-success').classList.contains('hidden')).toBe(false)
    expect($('state-error').classList.contains('hidden')).toBe(true)
    expect($('state-none').classList.contains('hidden')).toBe(true)
    expect($('state-success').textContent).toMatch(/Đã xác thực thành công/)
    expect($('state-success').textContent).toMatch(/quay lại trang web/i)
    expect(posted).toEqual([{ name: 'gbq-auth', m: { type: 'email-confirmed' } }])
  })

  it('xoá token khỏi thanh địa chỉ ngay lập tức', async () => {
    await open('#access_token=SECRET-TOKEN&type=signup')
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain('SECRET-TOKEN')
  })

  it('lỗi: KHÔNG báo cho trang đăng ký, hiện hướng dẫn và form gửi lại', async () => {
    await open('#error=access_denied&error_code=otp_expired')
    expect($('state-error').classList.contains('hidden')).toBe(false)
    expect($('state-success').classList.contains('hidden')).toBe(true)
    expect(posted).toEqual([])
    expect($('resend-form')).toBeTruthy()
  })

  it('không có gì trong địa chỉ: chỉ hiện hướng dẫn, không báo cho ai', async () => {
    await open('')
    expect($('state-none').classList.contains('hidden')).toBe(false)
    expect($('state-success').classList.contains('hidden')).toBe(true)
    expect(posted).toEqual([])
  })

  it('gửi lại từ trang lỗi: thông báo giống hệt nhau dù email có tồn tại hay không (chống dò tài khoản)', async () => {
    await open('#error=access_denied&error_code=otp_expired')
    const submit = async (email, result) => {
      resend.mockResolvedValueOnce(result)
      $('resend-email').value = email
      $('resend-form').dispatchEvent(new Event('submit', { cancelable: true }))
      await new Promise((r) => setTimeout(r, 20))
      return $('resend-feedback').textContent
    }
    const a = await submit('co@ton-tai.com', { error: null })
    $('resend-btn').disabled = false
    const b = await submit('khong@co.com', { error: { message: 'User not found' } })
    expect(a).toBe(b)
    expect(a).toMatch(/Nếu email này đang chờ xác nhận/)
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', email: 'khong@co.com' })
    )
  })
})
