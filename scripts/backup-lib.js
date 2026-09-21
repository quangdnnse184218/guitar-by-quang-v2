/**
 * Hàm dùng chung cho scripts/backup-data.js — tách riêng để kiểm thử được mà không cần
 * kết nối Supabase thật.
 */
import path from 'node:path'

/** PostgREST trả tối đa 1000 dòng mỗi lần, nên phải đọc theo từng trang. */
export const PAGE_SIZE = 1000

/**
 * Đọc HẾT các dòng của một bảng. Sắp xếp theo `orderBy` để các trang không chồng lấn/bỏ sót
 * khi dữ liệu đang thay đổi.
 */
export async function fetchAllRows(client, table, { orderBy, pageSize = PAGE_SIZE } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = client
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)
    if (orderBy) query = query.order(orderBy)
    const { data, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

const pad = (n) => String(n).padStart(2, '0')

/** Tên thư mục bản sao lưu theo giờ máy: 2026-09-22_1530 */
export function timestampName(date = new Date()) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`
  )
}

export const BACKUP_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{4}$/

/** `child` có nằm trong (hoặc trùng) `parent` không. */
export function isInsideDir(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Giữ `keep` bản mới nhất, xoá các bản cũ hơn. CHỈ đụng vào thư mục có tên đúng mẫu
 * `YYYY-MM-DD_HHMM` nên không bao giờ xoá nhầm file khác của bạn trong cùng thư mục.
 * @returns tên các thư mục đã xoá
 */
export function pruneOldBackups(fs, dir, keep) {
  if (!Number.isInteger(keep) || keep < 1) return []
  const names = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && BACKUP_DIR_PATTERN.test(e.name))
    .map((e) => e.name)
    .sort() // tên theo thời gian nên sắp theo chữ cũng là theo thời gian
  const remove = names.slice(0, Math.max(0, names.length - keep))
  for (const name of remove) fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  return remove
}

/** Ghi chú kích thước cho dễ đọc: 1.5 MB */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
