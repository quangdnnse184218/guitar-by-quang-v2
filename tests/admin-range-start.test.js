import { describe, it, expect } from 'vitest'
import { rangeStart } from '../src/admin/format.js'

// 2026-10-14 là thứ Tư.
const now = new Date(2026, 9, 14, 15, 30)

describe('rangeStart', () => {
  it('"all" không giới hạn', () => {
    expect(rangeStart('all', now)).toBeNull()
  })

  it('tuần bắt đầu từ thứ Hai lúc 0 giờ', () => {
    expect(rangeStart('week', now)).toEqual(new Date(2026, 9, 12))
  })

  it('chủ nhật vẫn thuộc tuần của thứ Hai trước đó', () => {
    expect(rangeStart('week', new Date(2026, 9, 18, 9))).toEqual(new Date(2026, 9, 12))
  })

  it('tuần có thể lùi sang tháng trước', () => {
    expect(rangeStart('week', new Date(2026, 10, 1, 9))).toEqual(new Date(2026, 9, 26))
  })

  it('tháng bắt đầu từ ngày 1', () => {
    expect(rangeStart('month', now)).toEqual(new Date(2026, 9, 1))
  })

  it('năm bắt đầu từ 1/1', () => {
    expect(rangeStart('year', now)).toEqual(new Date(2026, 0, 1))
  })
})
