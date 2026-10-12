import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loginGateLinks, openLoginGate } from '../src/lib/login-gate.js'
import { safeRedirectPath } from '../src/lib/navigate.js'

describe('hộp "Đăng nhập để mua tab"', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span id="auth-required-song-title"></span>
      <span id="auth-required-song-price"></span>
      <a id="auth-required-login-btn" href="/login.html"></a>
      <a id="auth-required-register-btn" href="/register.html"></a>`
  })

  it('đăng nhập và đăng ký đều quay lại đúng bài đang mua', () => {
    const { login, register } = loginGateLinks('tab-7')
    for (const url of [login, register]) {
      const back = new URL(url, 'https://x.invalid').searchParams.get('redirect')
      expect(back).toBe('/kho-tab.html?tab=tab-7')
      // đường quay về phải qua được bộ lọc chống open redirect
      expect(safeRedirectPath(back)).toBe('/kho-tab.html?tab=tab-7')
    }
    expect(login.startsWith('/login.html?')).toBe(true)
    expect(register.startsWith('/register.html?')).toBe(true)
  })

  it('mã bài có ký tự lạ vẫn được mã hoá, không phá đường dẫn', () => {
    const { login } = loginGateLinks('a&b=1#x')
    const back = new URL(login, 'https://x.invalid').searchParams.get('redirect')
    expect(new URL(back, 'https://x.invalid').searchParams.get('tab')).toBe('a&b=1#x')
  })

  it('ghi tên bài + giá vào hộp, gắn link, rồi mở hộp', () => {
    const toggleModal = vi.fn()
    openLoginGate({ id: 'tab-1', title: 'Sóng gió', price_formatted: '139k' }, toggleModal)
    expect(document.getElementById('auth-required-song-title').textContent).toBe('Sóng gió')
    expect(document.getElementById('auth-required-song-price').textContent).toBe('139k')
    expect(document.getElementById('auth-required-login-btn').getAttribute('href')).toContain('tab%3Dtab-1')
    expect(document.getElementById('auth-required-register-btn').getAttribute('href')).toContain('tab%3Dtab-1')
    expect(toggleModal).toHaveBeenCalledWith('auth-required-modal', true)
  })

  it('tên bài chứa HTML không được chạy như mã', () => {
    openLoginGate({ id: 't', title: '<img src=x onerror=alert(1)>' }, () => {})
    const el = document.getElementById('auth-required-song-title')
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
