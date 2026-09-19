/**
 * Hàm định dạng dùng chung cho các trang quản trị (trước đây mỗi module tự
 * chép lại `escapeHtml`/`formatVnd`, dễ lệch nhau khi sửa một chỗ).
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function formatVnd(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ'
}

/**
 * 1.250.000 → "1,25tr" · 1.200.000 → "1,2tr" · 239.000 → "239k" — cho chỗ hẹp
 * như nhãn biểu đồ. Không kèm "đ" (ghép "trđ"/"kđ" đọc rất vướng).
 */
export function formatVndShort(n) {
  const v = Number(n || 0)
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(2)).toString().replace('.', ',')}tr`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return String(v)
}

/** Số phút → "12 phút trước" / "5 giờ trước" / "3 ngày trước". */
export function formatAge(minutes) {
  const m = Number(minutes) || 0
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  if (m < 60 * 24) return `${Math.floor(m / 60)} giờ trước`
  return `${Math.floor(m / 60 / 24)} ngày trước`
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('vi-VN')
}

/** Ảnh đại diện; chưa có thì dùng chữ cái đầu của tên/email. */
export function avatarUrlFor(user) {
  return (
    user?.avatar_url ||
    'https://ui-avatars.com/api/?name=' +
      encodeURIComponent(user?.full_name || user?.email || 'User') +
      '&background=random'
  )
}

/**
 * % thay đổi so với kỳ trước. Trả về null khi kỳ trước = 0 (không có gì để so
 * sánh) — hiển thị "+∞%" hay "+100%" trong trường hợp đó là số liệu sai lệch.
 */
export function percentChange(current, previous) {
  const cur = Number(current) || 0
  const prev = Number(previous) || 0
  if (prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

/** Sao chép văn bản; trả về true/false thay vì ném lỗi khi bị chặn quyền. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
