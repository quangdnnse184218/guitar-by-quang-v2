/**
 * ==============================================================================
 * ĐỊNH DẠNG GIÁ & ƯU ĐÃI HIỂN THỊ TRÊN THẺ BÀI HÁT
 * ==============================================================================
 * Badge giá trên thẻ rất hẹp (nhất là ở lưới 2 cột trên mobile) nên giá luôn
 * được rút gọn về dạng "239k" thay vì "239.000đ". Dữ liệu giá trong bảng
 * `songs` do admin nhập tay nên có đủ kiểu: "239000", "239k", "239.000đ",
 * "Miễn phí", hoặc để trống — các hàm dưới đây quy hết về một dạng ngắn gọn.
 */

/**
 * Rút gọn giá về dạng "239k".
 * Quy ước: số >= 1000 hiểu là đồng (239000 -> "239k"); số < 1000 hiểu là admin
 * đã gõ tắt theo đơn vị nghìn (239 -> "239k").
 */
export function formatCompactPrice(val) {
  if (val === 0 || val === '0') return 'Miễn phí'
  if (!val && val !== 0) return '239k'
  const str = String(val).trim()
  if (!str || str.toLowerCase() === 'miễn phí' || str.toLowerCase() === 'free') return 'Miễn phí'
  if (str.toLowerCase().endsWith('k')) return str.toLowerCase()
  const numericOnly = Number(str.replace(/[^0-9]/g, ''))
  if (numericOnly >= 1000) {
    return `${Math.round(numericOnly / 1000)}k`
  }
  if (numericOnly > 0) {
    return `${numericOnly}k`
  }
  return str
}

/**
 * Rút gọn ghi chú ưu đãi HSSV về dạng "HSSV: 179k" để vừa badge trên thẻ.
 * Ghi chú dài (admin viết cả câu) sẽ được bóc lấy con số rồi dựng lại cho gọn.
 */
/**
 * Chỉ lấy giá ưu đãi HSSV dạng "179k" từ ghi chú admin nhập tay, để badge trên
 * thẻ hiện icon mũ tốt nghiệp + giá thay cho cả cụm chữ "HSSV: 179k". Lấy nhóm
 * số CUỐI CÙNG (ghi chú kiểu "HSSV 2026: 179k" không bị dính thành 2026179).
 * Trả '' khi không bóc được số — nơi gọi tự quay về hiện nguyên ghi chú.
 */
export function extractDiscountPrice(note) {
  if (!note) return ''
  const groups = String(note).match(/\d[\d.,]*/g)
  if (!groups) return ''
  const digits = groups[groups.length - 1].replace(/[^0-9]/g, '')
  return digits ? formatCompactPrice(digits) : ''
}

export function formatCompactDiscount(note) {
  if (!note) return 'HSSV: 179k'
  const str = String(note).trim()
  if (str.toLowerCase().includes('179')) return 'HSSV: 179k'
  if (str.length > 15) {
    const num = str.replace(/[^0-9]/g, '')
    if (num) return `HSSV: ${num.length >= 4 ? Math.round(Number(num) / 1000) : num}k`
  }
  return str
}

// ==========================================================================
// ĐỘ KHÓ, NHÃN "MỚI" / "BÁN CHẠY"
// ==========================================================================

/** "6.5/10" hoặc 6.5 → 6.5; thiếu hoặc không đọc được thì coi như giữa thang. */
export function parseLevel(value) {
  const n = parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 5
}

/** Dễ ≤ 5, Vừa 5,5–7,5, Khó ≥ 8 — chia theo độ phân bố độ khó thật của kho. */
export function levelTier(value) {
  const n = parseLevel(value)
  if (n <= 5) return 'easy'
  if (n < 8) return 'mid'
  return 'hard'
}

export const TIER_LABEL = { easy: 'Dễ', mid: 'Vừa', hard: 'Khó' }

/** Quy thang 10 về 5 chấm: 4 → 2 chấm, 6,5 → 4 chấm, 9 → 5 chấm. Luôn ít nhất 1. */
export function levelDots(value) {
  return Math.min(5, Math.max(1, Math.ceil(parseLevel(value) / 2)))
}

export const NEW_SONG_DAYS = 45

/** Bài thêm trong vòng NEW_SONG_DAYS ngày gần đây. */
export function isNewSong(createdAt, now = new Date()) {
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return false
  const age = now.getTime() - t
  return age >= 0 && age <= NEW_SONG_DAYS * 86400000
}

export const HOT_MIN_BUYS = 2
export const HOT_MAX = 3

/**
 * Các bài "Bán chạy": có ít nhất HOT_MIN_BUYS lượt mở khoá, tối đa HOT_MAX bài đứng đầu.
 * Ít lượt hơn thì không gắn nhãn — một bài mới bán được một lần chưa phải "bán chạy".
 * @param {Array<{song_id: string, buys: number}>} popularity
 * @returns {Set<string>}
 */
export function hotSongIds(popularity) {
  return new Set(
    (popularity || [])
      .filter((p) => Number(p.buys) >= HOT_MIN_BUYS)
      .sort((a, b) => b.buys - a.buys)
      .slice(0, HOT_MAX)
      .map((p) => String(p.song_id))
  )
}
