/**
 * Giá trong bảng `songs` do admin nhập tay nên có đủ kiểu ("239000", "239k",
 * "239.000đ", để trống...). Badge giá trên thẻ rất hẹp nên mọi kiểu nhập đều
 * phải quy về một dạng ngắn gọn — test ở đây khoá lại các quy tắc quy đổi đó.
 */
import { describe, expect, it } from 'vitest'
import {
  formatCompactPrice,
  formatCompactDiscount,
  extractDiscountPrice,
} from '../src/lib/song-format.js'

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

describe('extractDiscountPrice', () => {
  it('bóc giá từ ghi chú chuẩn "HSSV: 179k"', () => {
    expect(extractDiscountPrice('HSSV: 179k')).toBe('179k')
  })

  it('quy đổi số đồng đầy đủ về dạng nghìn', () => {
    expect(extractDiscountPrice('Giảm còn 149.000đ cho HSSV')).toBe('149k')
  })

  it('lấy nhóm số cuối cùng, không dính năm vào giá', () => {
    expect(extractDiscountPrice('HSSV 2026: 179k')).toBe('179k')
  })

  it('trả rỗng khi ghi chú không có số (để nơi gọi hiện nguyên ghi chú)', () => {
    expect(extractDiscountPrice('Ưu đãi cho HSSV')).toBe('')
    expect(extractDiscountPrice('')).toBe('')
    expect(extractDiscountPrice(null)).toBe('')
  })
})

describe('độ khó và nhãn thẻ', () => {
  it('chia độ khó thành Dễ / Vừa / Khó', async () => {
    const { levelTier } = await import('../src/lib/song-format.js')
    expect(levelTier('4/10')).toBe('easy')
    expect(levelTier('5/10')).toBe('easy')
    expect(levelTier('5.5/10')).toBe('mid')
    expect(levelTier('7.5/10')).toBe('mid')
    expect(levelTier('8.5/10')).toBe('hard')
    expect(levelTier(9)).toBe('hard')
    expect(levelTier(undefined)).toBe('easy')
  })

  it('quy về 5 chấm, ít nhất 1 và nhiều nhất 5', async () => {
    const { levelDots } = await import('../src/lib/song-format.js')
    expect(levelDots('4/10')).toBe(2)
    expect(levelDots('6.5/10')).toBe(4)
    expect(levelDots('9/10')).toBe(5)
    expect(levelDots('10/10')).toBe(5)
    expect(levelDots('0/10')).toBe(1)
  })

  it('"Mới" chỉ khi thêm trong 45 ngày gần đây', async () => {
    const { isNewSong } = await import('../src/lib/song-format.js')
    const now = new Date('2026-10-14T00:00:00Z')
    expect(isNewSong('2026-09-13T00:00:00Z', now)).toBe(true)
    expect(isNewSong('2026-08-24T00:00:00Z', now)).toBe(false)
    expect(isNewSong('2026-12-01T00:00:00Z', now)).toBe(false)
    expect(isNewSong(null, now)).toBe(false)
    expect(isNewSong('không phải ngày', now)).toBe(false)
  })

  it('"Bán chạy" cần từ 2 lượt, lấy tối đa 3 bài đứng đầu', async () => {
    const { hotSongIds } = await import('../src/lib/song-format.js')
    const hot = hotSongIds([
      { song_id: 'a', buys: 5 },
      { song_id: 'b', buys: 2 },
      { song_id: 'c', buys: 1 },
      { song_id: 'd', buys: 3 },
      { song_id: 'e', buys: 4 },
    ])
    expect([...hot].sort()).toEqual(['a', 'd', 'e'])
    expect(hotSongIds(null).size).toBe(0)
  })
})
