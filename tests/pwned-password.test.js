// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { isPasswordPwned } from '../src/lib/pwned-password.js'

// SHA-1('password') = 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
const PREFIX = '5BAA6'
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

const reply = (body, ok = true) => vi.fn(async () => ({ ok, text: async () => body }))

describe('kiểm tra mật khẩu đã lộ (k-anonymity)', () => {
  it('chỉ gửi 5 ký tự đầu của mã băm, không gửi mật khẩu hay mã băm đầy đủ', async () => {
    const fetchImpl = reply('')
    await isPasswordPwned('password', { fetchImpl })
    const url = fetchImpl.mock.calls[0][0]
    expect(url).toBe('https://api.pwnedpasswords.com/range/' + PREFIX)
    expect(url).not.toContain(SUFFIX)
    expect(url.split('/range/')[1]).toBe(PREFIX)
  })

  it('có trong danh sách với số lần > 0 thì báo đã lộ', async () => {
    const body = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${SUFFIX}:9545824\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2`
    expect(await isPasswordPwned('password', { fetchImpl: reply(body) })).toBe(true)
  })

  it('không có trong danh sách thì không báo', async () => {
    const body = '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2'
    expect(await isPasswordPwned('password', { fetchImpl: reply(body) })).toBe(false)
  })

  it('dòng đệm (số lần = 0) không tính là đã lộ', async () => {
    expect(await isPasswordPwned('password', { fetchImpl: reply(`${SUFFIX}:0`) })).toBe(false)
  })

  it('dịch vụ lỗi hoặc mất mạng thì cho qua, không chặn người dùng', async () => {
    expect(await isPasswordPwned('password', { fetchImpl: reply('', false) })).toBe(false)
    const broken = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await isPasswordPwned('password', { fetchImpl: broken })).toBe(false)
  })

  it('mật khẩu rỗng thì không gọi mạng', async () => {
    const fetchImpl = reply('')
    expect(await isPasswordPwned('', { fetchImpl })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('khi chạy test mà không truyền fetch giả thì không gọi ra mạng thật', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await isPasswordPwned('password')).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
