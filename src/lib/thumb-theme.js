/**
 * ==============================================================================
 * NỀN ẢNH BÌA BÀI HÁT (thumbnail) — gom về token màu
 * ==============================================================================
 * Cột `songs.thumbnail_bg` từng lưu nguyên chuỗi Tailwind kiểu
 * "from-[#C1602F] to-[#6E3B1F]" (hex cứng, lệch bảng màu thương hiệu: đất nung và
 * xanh rừng). Nay lưu TÊN nền (thumb-walnut, thumb-wine...), màu thật nằm ở biến
 * `--thumb-*` trong src/style.css.
 *
 * resolveThumbTheme() là lớp đệm tương thích: giá trị cũ trong database (chuỗi hex)
 * hay giá trị rỗng đều được đổi sang nền mặc định theo loại bài khi hiển thị, nên
 * giao diện đúng dù migration đã chạy hay chưa. Chỉ cần dữ liệu CHƯA đổi là vẫn
 * không lộ màu cũ ra trang.
 */

export const DEFAULT_THUMB_FREE = 'thumb-walnut'
export const DEFAULT_THUMB_PAID = 'thumb-wine'

/** Các nền admin được chọn (giá trị = tên class trong style.css). */
export const THUMB_THEMES = [
  { value: 'thumb-walnut', label: 'Gỗ óc chó (mặc định bài miễn phí)' },
  { value: 'thumb-wine', label: 'Rượu vang (mặc định bài có phí)' },
  { value: 'thumb-brass', label: 'Đồng thau' },
  { value: 'thumb-slate', label: 'Than chì' },
]

const KNOWN = new Set(THUMB_THEMES.map((t) => t.value))

/**
 * @param {string|null|undefined} raw  Giá trị thumbnail_bg (mới hoặc cũ)
 * @param {boolean} isFree             Bài miễn phí hay có phí
 * @returns {string} Tên class nền, luôn là một giá trị hợp lệ
 */
export function resolveThumbTheme(raw, isFree) {
  const value = String(raw || '').trim()
  if (KNOWN.has(value)) return value
  return isFree ? DEFAULT_THUMB_FREE : DEFAULT_THUMB_PAID
}
