// Logic thuần của verify-hssv-card: đọc kết quả Gemini và quyết định
// duyệt / chờ admin / từ chối. Tách riêng để test bằng vitest, không cần Deno.

export type HssvStatus = 'approved' | 'pending' | 'rejected'

export interface CardReading {
  is_student_card?: boolean | null
  legible?: boolean | null
  full_name?: string | null
  school?: string | null
  student_id?: string | null
  expiry_year?: number | string | null
  reason?: string | null
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
}): Decision {
  const { reading, currentYear, accountName, duplicateOnOtherAccount } = input

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

  const softFlags: string[] = []
  if (namesMismatch(reading.full_name, accountName)) softFlags.push('name_mismatch')

  if (flags.length > 0) {
    return {
      status: 'pending',
      flags: [...flags, ...softFlags],
      message:
        'Ảnh thẻ chưa đủ để hệ thống tự duyệt. Yêu cầu của bạn đã chuyển cho admin xét duyệt.',
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
