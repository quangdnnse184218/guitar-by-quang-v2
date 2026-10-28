import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loginGateLinks, applyCheckoutLoginGate } from '../src/lib/login-gate.js'
import { safeRedirectPath } from '../src/lib/navigate.js'

describe('cửa sổ thanh toán cho khách chưa đăng nhập', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="checkout-login-gate" class="hidden">
        <a id="checkout-gate-login-btn" href="/login.html"></a>
        <a id="checkout-gate-register-btn" href="/register.html"></a>
      </div>
      <div id="checkout-pay-block"></div>`
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

  it('chưa đăng nhập: hiện lời mời đăng nhập, ẩn khối chuyển khoản/QR, link quay lại đúng bài', () => {
    applyCheckoutLoginGate({ id: 'tab-1' }, false)
    expect(document.getElementById('checkout-login-gate').classList.contains('hidden')).toBe(false)
    expect(document.getElementById('checkout-pay-block').classList.contains('hidden')).toBe(true)
    expect(document.getElementById('checkout-gate-login-btn').getAttribute('href')).toContain('tab%3Dtab-1')
    expect(document.getElementById('checkout-gate-register-btn').getAttribute('href')).toContain('tab%3Dtab-1')
  })

  it('đã đăng nhập: hiện khối chuyển khoản, ẩn lời mời (kể cả sau khi vừa mở ở trạng thái khách)', () => {
    applyCheckoutLoginGate({ id: 'tab-1' }, false)
    applyCheckoutLoginGate({ id: 'tab-1' }, true)
    expect(document.getElementById('checkout-login-gate').classList.contains('hidden')).toBe(true)
    expect(document.getElementById('checkout-pay-block').classList.contains('hidden')).toBe(false)
  })

  it('thiếu phần tử trên trang (vd. trang cá nhân) thì không lỗi', () => {
    document.body.innerHTML = ''
    expect(() => applyCheckoutLoginGate({ id: 't' }, false)).not.toThrow()
  })
})
