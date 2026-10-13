import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }))

const { renderSongCard } = await import('../src/lib/song-card.js')

const paid = {
  id: 'tab-1',
  title: 'Rồi em sẽ gặp 1 chàng trai khác',
  singer: 'The Masked Singer',
  level: '9/10',
  level_num: 9,
  is_free: false,
  price_formatted: '239k',
  discount_note: 'HSSV: 179k',
}
const free = { id: 'tab-9', title: 'Âm thầm bên em', level: '4/10', level_num: 4, is_free: true }

describe('thẻ bài hát', () => {
  it('độ khó hiện 5 chấm, đủ số chấm sáng và nhãn Khó/Dễ', () => {
    const hard = renderSongCard(paid)
    expect((hard.match(/level-dot is-on/g) || []).length).toBe(5)
    expect(hard).toContain('Khó')
    const easy = renderSongCard(free)
    expect((easy.match(/level-dot is-on/g) || []).length).toBe(2)
    expect(easy).toContain('Dễ')
    expect((easy.match(/class="level-dot( is-on)?"/g) || []).length).toBe(5)
  })

  it('gắn nhãn Mới / Bán chạy khi được yêu cầu, không thì không có', () => {
    const plain = renderSongCard(paid)
    expect(plain).not.toContain('song-chip')
    const badged = renderSongCard(paid, { isNew: true, isHot: true })
    expect(badged).toContain('Bán chạy')
    expect(badged).toContain('Mới')
  })

  it('quickView mở cửa sổ xem nhanh thay vì đi thẳng tới thanh toán / tab miễn phí', () => {
    expect(renderSongCard(paid)).toContain("openCheckoutModal('tab-1')")
    expect(renderSongCard(paid, { quickView: true })).toContain("openQuickView('tab-1')")
    expect(renderSongCard(free)).toContain("openFreeTabModal('tab-9')")
    expect(renderSongCard(free, { quickView: true })).toContain("openQuickView('tab-9')")
  })

  it('bài đã mua có viền riêng và luôn mở tab đã mua, kể cả khi bật xem nhanh', () => {
    const owned = renderSongCard(paid, { isPurchased: true, quickView: true })
    expect(owned).toContain('song-card-owned')
    expect(owned).toContain('navigateToPurchasesTab')
    expect(owned).not.toContain('openQuickView')
  })

  it('bài trả phí hiện giá HSSV ngay trên thẻ', () => {
    expect(renderSongCard(paid)).toContain('HSSV 179k')
  })
})
