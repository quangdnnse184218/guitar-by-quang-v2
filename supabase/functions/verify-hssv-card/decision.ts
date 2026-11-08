// Logic thuần của verify-hssv-card: đọc kết quả Gemini và quyết định
// duyệt / chờ admin / từ chối. Tách riêng để test bằng vitest, không cần Deno.

import type { EmailMatch } from './email.ts'

export type HssvStatus = 'approved' | 'pending' | 'rejected'

export interface CardReading {
  is_student_card?: boolean | null
  legible?: boolean | null
  full_name?: string | null
  school?: string | null
  student_id?: string | null
  expiry_year?: number | string | null
  reason?: string | null
  // Ba câu AI trả lời thêm khi khách gửi kèm email trường (2026-11):
  //   school_matches_email_domain — trường in trên thẻ có đúng là trường của tên miền email không
  //   is_physical_card_photo      — ảnh chụp trực tiếp tấm thẻ thật (không phải chụp màn hình, bản in)
  //   signs_of_editing            — có dấu hiệu chỉnh sửa (chữ chèn đè, phông lệch, ảnh dán đè)
  school_matches_email_domain?: boolean | null
  is_physical_card_photo?: boolean | null
  signs_of_editing?: boolean | null
}

export interface Decision {
  status: HssvStatus
  flags: string[]
  message: string
  studentId: string | null
  expiryYear: number | null
}

/** "sv 12-345 a" -> "SV12345A". Chỉ giữ chữ và số để hai lần chụp so được với nhau. */
export function normalizeStudentId(raw: unknown): string | null {
  if (raw == null) return null
  const cleaned = String(raw)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
  return cleaned.length >= 4 ? cleaned : null
}

// Dải dấu kết hợp Unicode (U+0300–U+036F), dựng từ mã số để file không chứa ký tự vô hình.
const COMBINING_MARKS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']',
  'g'
)

/** Bỏ dấu, hạ chữ thường, chỉ giữ chữ cái — để so tên trên thẻ với tên tài khoản. */
export function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tên tài khoản hay là biệt danh ("Quang Guitar"), nên chỉ coi là KHÔNG khớp khi
 * hai tên không có từ nào chung. Cờ này chỉ để admin để ý, không chặn giảm giá.
 */
export function namesMismatch(cardName: unknown, accountName: unknown): boolean {
  const a = normalizeName(cardName)
    .split(' ')
    .filter((w) => w.length > 1)
  const b = normalizeName(accountName)
    .split(' ')
    .filter((w) => w.length > 1)
  if (a.length === 0 || b.length === 0) return false // không đủ dữ liệu để kết luận
  return !a.some((w) => b.includes(w))
}

const TO_ADMIN = ' Yêu cầu của bạn đã chuyển cho admin xét duyệt.'

/** Lời nhắn cho khách khi chưa tự duyệt được — nói đúng lý do chính, không lộ chi tiết chấm điểm. */
function pendingMessage(flags: string[]): string {
  if (flags.includes('school_domain_mismatch')) {
    return 'Tên trường trên thẻ chưa khớp với email trường bạn nhập nên hệ thống chưa tự duyệt.' + TO_ADMIN
  }
  if (flags.includes('not_physical_card') || flags.includes('possible_edit')) {
    return 'Ảnh cần chụp trực tiếp tấm thẻ thật (không chụp lại màn hình hay bản in) nên hệ thống chưa tự duyệt.' + TO_ADMIN
  }
  if (flags.length === 1 && flags[0] === 'email_mismatch') {
    return 'Email trường chưa khớp với thông tin trên thẻ nên hệ thống chưa tự duyệt.' + TO_ADMIN
  }
  return 'Ảnh thẻ chưa đủ để hệ thống tự duyệt.' + TO_ADMIN
}

function parseYear(raw: unknown): number | null {
  if (raw == null) return null
  const n = Number(
    String(raw)
      .replace(/[^0-9]/g, '')
      .slice(0, 4)
  )
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : null
}

export function decideHssv(input: {
  reading: CardReading | null // null = AI lỗi hoặc trả về không đọc được
  currentYear: number
  accountName?: string | null
  duplicateOnOtherAccount: boolean
  // Email trường (đã xác nhận bằng mã) so với thẻ — xem emailMatchesCard() trong email.ts.
  // undefined = lượt không có email (dữ liệu cũ / admin duyệt tay): bỏ qua bước so.
  emailMatch?: EmailMatch | null
  emailUsedByOtherAccount?: boolean
}): Decision {
  const { reading, currentYear, accountName, duplicateOnOtherAccount, emailMatch, emailUsedByOtherAccount } = input

  // Email trường đã gắn với tài khoản KHÁC: từ chối trước cả khi xét thẻ (một email — một tài khoản).
  if (emailUsedByOtherAccount) {
    return {
      status: 'rejected',
      flags: ['duplicate_email'],
      message:
        'Email trường này đã được dùng để giảm giá ở một tài khoản khác nên không áp dụng lại được. Nếu đây là email của bạn, hãy nhắn admin qua Zalo để được hỗ trợ.',
      studentId: normalizeStudentId(reading?.student_id),
      expiryYear: null,
    }
  }

  if (!reading) {
    return {
      status: 'pending',
      flags: ['ai_unavailable'],
      message: 'Hệ thống chưa đọc được thẻ lúc này. Yêu cầu của bạn đã chuyển cho admin xét duyệt.',
      studentId: null,
      expiryYear: null,
    }
  }

  const studentId = normalizeStudentId(reading.student_id)
  const expiryYear = parseYear(reading.expiry_year)

  // Chắc chắn không phải thẻ: từ chối luôn, không cần admin.
  if (reading.is_student_card === false) {
    return {
      status: 'rejected',
      flags: [],
      message: reading.reason || 'Ảnh này không phải thẻ học sinh/sinh viên.',
      studentId,
      expiryYear,
    }
  }

  // Thẻ đã hết hạn: từ chối.
  if (expiryYear !== null && expiryYear < currentYear) {
    return {
      status: 'rejected',
      flags: ['expired'],
      message: `Thẻ hết hạn từ năm ${expiryYear}. Bạn thử thẻ còn hiệu lực hoặc thanh toán giá thường nhé.`,
      studentId,
      expiryYear,
    }
  }

  // Cùng mã HS/SV đã được một tài khoản KHÁC dùng để giảm giá: từ chối luôn (một thẻ chỉ
  // giảm giá cho một tài khoản). Chủ thẻ thật bị người khác dùng trước thì nhắn admin xử lý.
  if (duplicateOnOtherAccount) {
    return {
      status: 'rejected',
      flags: namesMismatch(reading.full_name, accountName)
        ? ['duplicate_id', 'name_mismatch']
        : ['duplicate_id'],
      message:
        'Thẻ này đã được dùng để giảm giá ở một tài khoản khác nên không áp dụng lại được. Nếu đây là thẻ của bạn, hãy nhắn admin để được hỗ trợ.',
      studentId,
      expiryYear,
    }
  }

  // Từ đây trở đi chỉ có duyệt hoặc chờ admin — không từ chối nhầm khách thật.
  const flags: string[] = []
  if (reading.is_student_card !== true) flags.push('card_uncertain')
  if (reading.legible === false) flags.push('unreadable')
  if (!studentId) flags.push('no_student_id')
  if (expiryYear === null) flags.push('no_expiry')
  // Thẻ đọc được mà email không mang mã SV lẫn tên trên thẻ: có thể là thẻ mượn — để admin xem.
  // Không tự từ chối: nhiều trường đặt email theo quy tắc riêng.
  if (emailMatch === 'none') flags.push('email_mismatch')

  // Có email trường (emailMatch khác undefined) thì tên trường trên thẻ phải được AI xác nhận là
  // ĐÚNG trường của tên miền email mới tự duyệt; AI không chắc cũng để admin xem. Đây là lớp chặn
  // "email trường A + thẻ trường B" (mượn thẻ người khác, hoặc tự dựng thẻ giả cho email thật).
  const withEmail = emailMatch !== undefined
  if (reading.school_matches_email_domain === false) flags.push('school_domain_mismatch')
  else if (withEmail && reading.school_matches_email_domain !== true) flags.push('school_domain_unverified')
  // Ảnh không phải chụp tấm thẻ thật, hoặc có dấu hiệu sửa: không tự duyệt.
  if (reading.is_physical_card_photo === false) flags.push('not_physical_card')
  if (reading.signs_of_editing === true) flags.push('possible_edit')

  const softFlags: string[] = []
  if (namesMismatch(reading.full_name, accountName)) softFlags.push('name_mismatch')

  if (flags.length > 0) {
    return {
      status: 'pending',
      flags: [...flags, ...softFlags],
      message: pendingMessage(flags),
      studentId,
      expiryYear,
    }
  }

  return {
    status: 'approved',
    flags: softFlags,
    message: reading.reason || 'Đã xác minh thẻ HSSV.',
    studentId,
    expiryYear,
  }
}
