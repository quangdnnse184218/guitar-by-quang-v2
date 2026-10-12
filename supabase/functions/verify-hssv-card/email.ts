// Logic thuần cho bước "email trường" của giảm giá sinh viên: kiểm tra địa chỉ, so email với
// thông tin AI đọc từ thẻ, và các giới hạn gửi/nhập mã. Tách riêng để test bằng vitest.
import { normalizeName, normalizeStudentId } from './decision.ts'

export const CODE_TTL_MS = 10 * 60 * 1000 // mã có hiệu lực 10 phút
export const CODE_MAX_ATTEMPTS = 5 // nhập sai quá số này thì phải xin mã mới
export const CODE_RESEND_WAIT_MS = 60 * 1000 // tối thiểu giữa hai lần gửi cho cùng một đơn
export const CODE_MAX_PER_HOUR = 5 // mỗi tài khoản xin tối đa ngần này mã / giờ
export const EMAIL_VERIFIED_TTL_MS = 60 * 60 * 1000 // xác nhận email xong phải gửi ảnh thẻ trong 1 giờ

// Chỉ nhận email của trường học ở Việt Nam (tên miền kết thúc bằng .edu.vn). Trường không cấp
// email, hoặc cấp email đuôi khác, thì khách nhắn Zalo để được duyệt tay.
const SCHOOL_EMAIL = /^[a-z0-9][a-z0-9._%+-]{0,63}@(?:[a-z0-9-]{1,63}\.)+edu\.vn$/

export function normalizeSchoolEmail(raw: unknown): string | null {
  const email = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (email.length > 254 || email.includes('..')) return null
  return SCHOOL_EMAIL.test(email) ? email : null
}

export type EmailMatch = 'id' | 'name' | 'none'

/**
 * Email trường có "thuộc về" người trên thẻ không?
 *   'id'   — phần trước @ chứa đúng mã SV in trên thẻ (vd quangdnnse184218 ↔ SE184218): chắc nhất
 *   'name' — không thấy mã nhưng chứa TÊN (từ cuối của họ tên) và thêm một dấu hiệu nữa:
 *            chuỗi chữ cái đầu của các từ còn lại (dnn) hoặc một từ khác của họ tên (nguyen)
 *   'none' — không có dấu hiệu nào. KHÔNG phải bằng chứng gian lận (nhiều trường đặt email theo
 *            quy tắc riêng), nên chỉ dùng để chuyển lượt cho admin xem, không tự từ chối.
 */
export function emailMatchesCard(
  email: string,
  card: { studentId?: unknown; fullName?: unknown }
): EmailMatch {
  const local = String(email).split('@')[0].toLowerCase()
  const localAlnum = local.replace(/[^a-z0-9]/g, '')

  const id = normalizeStudentId(card.studentId)
  if (id && id.length >= 5 && localAlnum.includes(id.toLowerCase())) return 'id'
  // Mã toàn số dài (vd 20520123) đôi khi chỉ có phần số nằm trong email
  const idDigits = id ? id.replace(/[^0-9]/g, '') : ''
  if (idDigits.length >= 6 && localAlnum.includes(idDigits)) return 'id'

  const words = normalizeName(card.fullName)
    .split(' ')
    .filter(Boolean)
  if (words.length >= 2) {
    const given = words[words.length - 1]
    const rest = words.slice(0, -1)
    if (given.length >= 2 && localAlnum.includes(given)) {
      const initials = rest.map((w) => w[0]).join('')
      const hasInitials = initials.length >= 2 && localAlnum.includes(initials)
      const hasOtherWord = rest.some((w) => w.length >= 3 && localAlnum.includes(w))
      if (hasInitials || hasOtherWord) return 'name'
    }
  }
  return 'none'
}

export interface CodeRow {
  id: string
  email: string
  code_hash: string
  attempts: number
  created_at: string
  expires_at: string
  verified_at: string | null
}

/** Được gửi mã mới chưa? `rows` = mọi mã tài khoản này đã xin (mọi đơn), `orderRows` = riêng đơn này. */
export function canSendCode(input: {
  now: number
  userRows: Array<Pick<CodeRow, 'created_at'>>
  orderRows: Array<Pick<CodeRow, 'created_at'>>
}): { ok: true } | { ok: false; error: 'wait' | 'too_many'; retryAfterSec: number } {
  const { now, userRows, orderRows } = input
  const lastForOrder = Math.max(0, ...orderRows.map((r) => Date.parse(r.created_at) || 0))
  if (lastForOrder && now - lastForOrder < CODE_RESEND_WAIT_MS) {
    return { ok: false, error: 'wait', retryAfterSec: Math.ceil((CODE_RESEND_WAIT_MS - (now - lastForOrder)) / 1000) }
  }
  const hourAgo = now - 60 * 60 * 1000
  const recent = userRows.map((r) => Date.parse(r.created_at) || 0).filter((t) => t > hourAgo)
  if (recent.length >= CODE_MAX_PER_HOUR) {
    const oldest = Math.min(...recent)
    return { ok: false, error: 'too_many', retryAfterSec: Math.ceil((oldest + 60 * 60 * 1000 - now) / 1000) }
  }
  return { ok: true }
}

/** Mã mới nhất còn dùng được cho đúng email này (chưa xác nhận, chưa hết hạn). */
export function activeCode(rows: CodeRow[], email: string, now: number): CodeRow | null {
  return (
    rows
      .filter((r) => r.email === email && !r.verified_at && Date.parse(r.expires_at) > now)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null
  )
}

/** Email này đã được xác nhận cho đơn này trong vòng 1 giờ qua chưa? */
export function isEmailVerified(rows: CodeRow[], email: string, now: number): boolean {
  return rows.some(
    (r) => r.email === email && r.verified_at && now - Date.parse(r.verified_at) < EMAIL_VERIFIED_TTL_MS
  )
}

/** So hai chuỗi hex cùng độ dài mà không lộ vị trí khác nhau qua thời gian chạy. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
