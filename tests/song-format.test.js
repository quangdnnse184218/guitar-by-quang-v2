/**
 * Giá trong bảng `songs` do admin nhập tay nên có đủ kiểu ("239000", "239k",
 * "239.000đ", để trống...). Badge giá trên thẻ rất hẹp nên mọi kiểu nhập đều
 * phải quy về một dạng ngắn gọn — test ở đây khoá lại các quy tắc quy đổi đó.
 */
import { describe, expect, it } from 'vitest'
import { formatCompactPrice, formatCompactDiscount } from '../src/lib/song-format.js'

describe('formatCompactPrice', () => {
  it('quy số tiền đầy đủ về dạng rút gọn "k"', () => {
    expect(formatCompactPrice('239000')).toBe('239k')
    expect(formatCompactPrice(239000)).toBe('239k')
  })

  it('bỏ qua dấu chấm và đơn vị tiền admin gõ thêm', () => {
    expect(formatCompactPrice('239.000đ')).toBe('239k')
    expect(formatCompactPrice('239,000 VNĐ')).toBe('239k')
  })

  it('hiểu số nhỏ hơn 1000 là admin đã gõ tắt theo đơn vị nghìn', () => {
    expect(formatCompactPrice('239')).toBe('239k')
    expect(formatCompactPrice(49)).toBe('49k')
  })

  it('giữ nguyên khi admin đã gõ sẵn dạng rút gọn', () => {
    expect(formatCompactPrice('239k')).toBe('239k')
    expect(formatCompactPrice('239K')).toBe('239k')
  })

  it('nhận diện bài miễn phí', () => {
    expect(formatCompactPrice(0)).toBe('Miễn phí')
    expect(formatCompactPrice('0')).toBe('Miễn phí')
    expect(formatCompactPrice('Miễn phí')).toBe('Miễn phí')
    expect(formatCompactPrice('free')).toBe('Miễn phí')
  })

  it('rơi về giá mặc định khi admin bỏ trống, không để thẻ hiện rỗng', () => {
    expect(formatCompactPrice(null)).toBe('239k')
    expect(formatCompactPrice(undefined)).toBe('239k')
    expect(formatCompactPrice('')).toBe('239k')
  })
})

describe('formatCompactDiscount', () => {
  it('rơi về ưu đãi mặc định khi chưa nhập ghi chú', () => {
    expect(formatCompactDiscount(null)).toBe('HSSV: 179k')
    expect(formatCompactDiscount('')).toBe('HSSV: 179k')
  })

  it('giữ nguyên ghi chú ngắn admin tự viết', () => {
    expect(formatCompactDiscount('HSSV: 149k')).toBe('HSSV: 149k')
  })

  it('rút gọn ghi chú dài thành badge vừa khung thẻ', () => {
    expect(formatCompactDiscount('Ưu đãi học sinh sinh viên chỉ còn 149000 đồng')).toBe(
      'HSSV: 149k'
    )
  })
})
