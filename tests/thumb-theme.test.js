import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THUMB_FREE,
  DEFAULT_THUMB_PAID,
  THUMB_THEMES,
  resolveThumbTheme,
} from '../src/lib/thumb-theme.js'

describe('resolveThumbTheme', () => {
  it('giữ nguyên tên nền hợp lệ', () => {
    for (const t of THUMB_THEMES) {
      expect(resolveThumbTheme(t.value, true)).toBe(t.value)
      expect(resolveThumbTheme(t.value, false)).toBe(t.value)
    }
  })

  it('giá trị cũ (chuỗi hex Tailwind) đổi sang nền mặc định theo loại bài', () => {
    expect(resolveThumbTheme('from-[#C1602F] to-[#6E3B1F]', false)).toBe(DEFAULT_THUMB_PAID)
    expect(resolveThumbTheme('from-[#D8C4AC] to-[#647A6C]', true)).toBe(DEFAULT_THUMB_FREE)
    expect(resolveThumbTheme('from-[#E0C9A6] to-[#CE9145]', true)).toBe(DEFAULT_THUMB_FREE)
  })

  it('rỗng / null / undefined rơi về mặc định', () => {
    expect(resolveThumbTheme('', true)).toBe(DEFAULT_THUMB_FREE)
    expect(resolveThumbTheme(null, false)).toBe(DEFAULT_THUMB_PAID)
    expect(resolveThumbTheme(undefined, false)).toBe(DEFAULT_THUMB_PAID)
  })

  it('không bao giờ trả ra chuỗi lạ (không chèn được class tuỳ ý vào HTML)', () => {
    const out = resolveThumbTheme('thumb-wine" onclick="x()', false)
    expect(THUMB_THEMES.map((t) => t.value)).toContain(out)
  })
})
