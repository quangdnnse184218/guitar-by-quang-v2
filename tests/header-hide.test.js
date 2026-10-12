import { describe, it, expect, vi } from 'vitest'

// common.js nạp client Supabase thật, mà client đó cần VITE_SUPABASE_URL — máy CI không có
// .env.local nên phải thay bằng bản giả (hàm đang test không đụng tới Supabase).
vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}))

const { nextHeaderHidden } = await import('../src/common.js')

describe('ẩn header khi cuộn xuống, hiện lại khi cuộn lên', () => {
  it('gần đầu trang thì luôn hiện, kể cả đang cuộn xuống', () => {
    expect(nextHeaderHidden({ y: 100, lastY: 20, hidden: false })).toBe(false)
    expect(nextHeaderHidden({ y: 120, lastY: 300, hidden: true })).toBe(false)
  })

  it('cuộn xuống quá 8px thì ẩn', () => {
    expect(nextHeaderHidden({ y: 400, lastY: 380, hidden: false })).toBe(true)
  })

  it('cuộn lên quá 8px thì hiện lại', () => {
    expect(nextHeaderHidden({ y: 380, lastY: 400, hidden: true })).toBe(false)
  })

  it('nhích nhẹ (≤ 8px) thì giữ nguyên trạng thái, không nhấp nháy', () => {
    expect(nextHeaderHidden({ y: 405, lastY: 400, hidden: false })).toBe(false)
    expect(nextHeaderHidden({ y: 405, lastY: 400, hidden: true })).toBe(true)
    expect(nextHeaderHidden({ y: 395, lastY: 400, hidden: true })).toBe(true)
    expect(nextHeaderHidden({ y: 408, lastY: 400, hidden: false })).toBe(false)
  })

  it('đang mở menu / đang gõ trong header / đang mở hộp thoại thì không bao giờ ẩn', () => {
    expect(nextHeaderHidden({ y: 900, lastY: 500, hidden: false, locked: true })).toBe(false)
    expect(nextHeaderHidden({ y: 900, lastY: 880, hidden: true, locked: true })).toBe(false)
  })
})
