/**
 * Tên bài / tên đồ nghề / ca sĩ do admin nhập được chèn vào HTML bằng chuỗi template.
 * Một tên có `<`, `"` hay `'` trước đây đủ để vỡ thẻ, vỡ thuộc tính onclick (bấm thẻ không mở
 * được hộp thanh toán), hoặc chèn được HTML lạ vào trang khách. Khoá lại: nội dung hiện đúng
 * nguyên văn, không sinh thêm phần tử, và tham số trong onclick vẫn đúng giá trị gốc.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }))

const NASTY = `Bài "A" của Quang's <img src=x onerror="window.__pwned=1">`
const NASTY_ID = `tab-1'); window.__pwned=1; ('`

const SONGS = [
  {
    id: NASTY_ID,
    title: NASTY,
    singer: '<b>Ca sĩ</b>',
    category: '<i>Pop</i>',
    tuning: 'Drop D <x>',
    capo: '2"',
    level: '9/10 <u>',
    level_num: 9,
    duration: '03:15 <s>',
    is_free: false,
    price: 99000,
    price_formatted: '99k <em>',
    discount_note: 'HSSV: 79k <em>',
  },
]
const GEARS = [
  {
    id: 'gear-1',
    name: NASTY,
    category: '<i>Dây</i>',
    description: '<script>x</script>',
    footer_text: '1.000.000đ <b>',
    image_url: '/a.jpg" onerror="window.__pwned=1',
  },
]

vi.mock('../src/lib/songs-service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAllSongs: vi.fn(async () => SONGS),
}))
vi.mock('../src/lib/gears-service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAllGears: vi.fn(async () => GEARS),
}))

/** Chạy thử chuỗi JS trong onclick với `window` giả, trả về các lời gọi. */
function runOnclick(el, fnName) {
  const calls = []
  const fakeWindow = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]) })
  const event = { stopPropagation() {} }
  new Function('window', 'event', el.getAttribute('onclick'))(fakeWindow, event)
  return calls.filter(([k]) => k === fnName)
}

function mount(html) {
  const box = document.createElement('div')
  box.innerHTML = html
  return box
}

describe('thẻ bài hát (trang chủ, kho tab)', () => {
  let renderSongCard
  beforeAll(async () => {
    ;({ renderSongCard } = await import('../src/lib/song-card.js'))
  })

  it('tên, ca sĩ, giá, tuning hiện đúng nguyên văn, không sinh thêm phần tử', () => {
    const box = mount(renderSongCard(SONGS[0]))
    expect(box.querySelector('img, b, i, u, s, em, x')).toBeNull()
    expect(box.querySelector('h3').textContent.trim()).toBe(NASTY)
    expect(box.querySelector('.song-card-singer').textContent).toBe('<b>Ca sĩ</b>')
    expect(box.textContent).toContain('99k <em>')
    expect(box.textContent).toContain('Drop D <x>')
  })

  it('bấm thẻ vẫn mở đúng hộp thanh toán với mã bài gốc', () => {
    const card = mount(renderSongCard(SONGS[0])).querySelector('.song-card')
    expect(card.dataset.id).toBe(NASTY_ID)
    expect(runOnclick(card, 'openCheckoutModal')).toEqual([['openCheckoutModal', NASTY_ID]])
  })

  it('nút xem demo truyền đúng tên bài gốc', () => {
    const song = { ...SONGS[0], demo_video_url: '/videos/a.mp4' }
    const center = mount(renderSongCard(song)).querySelector('[onclick*="openVideoDemoModal"]')
    const [[, title]] = runOnclick(center, 'openVideoDemoModal')
    expect(title).toBe(NASTY)
  })

  it('thẻ miễn phí và nút tim cũng giữ đúng mã bài', () => {
    const box = mount(renderSongCard({ ...SONGS[0], is_free: true }, { showFavoriteButton: true }))
    expect(runOnclick(box.querySelector('.song-card'), 'openFreeTabModal')).toEqual([['openFreeTabModal', NASTY_ID]])
    const fav = box.querySelector('[data-fav-btn]')
    expect(fav.dataset.favBtn).toBe(NASTY_ID)
    expect(runOnclick(fav, 'handleToggleFavorite')[0][2]).toBe(NASTY_ID)
  })
})

describe('bảng quản trị bài hát và đồ nghề', () => {
  beforeAll(() => {
    document.body.innerHTML = '<table><tbody id="admin-songs-tbody"></tbody></table><table><tbody id="admin-gears-tbody"></tbody></table>'
  })

  it('bảng bài hát: không sinh phần tử lạ, nút Xoá truyền đúng mã và tên gốc', async () => {
    const { loadSongs } = await import('../src/admin/songs.js')
    await loadSongs()
    const tbody = document.getElementById('admin-songs-tbody')
    expect(tbody.querySelector('img, b, i, u, x')).toBeNull()
    expect(tbody.textContent).toContain(NASTY)
    expect(tbody.textContent).toContain('<i>Pop</i>')

    const row = tbody.querySelector('tr')
    expect(row.dataset.id).toBe(NASTY_ID)
    const del = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Xóa')
    expect(runOnclick(del, 'deleteSong')).toEqual([['deleteSong', NASTY_ID, NASTY]])
    const edit = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sửa')
    expect(runOnclick(edit, 'editSong')).toEqual([['editSong', NASTY_ID]])
  })

  it('bảng đồ nghề: ảnh không bị chèn onerror, nút Xoá truyền đúng tên gốc', async () => {
    const { loadGears } = await import('../src/admin/gears.js')
    await loadGears()
    const tbody = document.getElementById('admin-gears-tbody')
    expect(tbody.querySelector('script, b, i')).toBeNull()
    const img = tbody.querySelector('img')
    expect(img.getAttribute('src')).toBe(GEARS[0].image_url)
    expect(img.getAttribute('alt')).toBe(NASTY)
    expect(img.getAttribute('onerror')).toBe("this.src='/assets/avatar.jpg'")

    const del = [...tbody.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Xóa')
    expect(runOnclick(del, 'deleteGear')).toEqual([['deleteGear', 'gear-1', NASTY]])
  })
})
