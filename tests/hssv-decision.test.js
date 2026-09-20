import { describe, it, expect } from 'vitest'
import {
  decideHssv,
  normalizeStudentId,
  normalizeName,
  namesMismatch,
} from '../supabase/functions/verify-hssv-card/decision.ts'

const good = (over = {}) => ({
  is_student_card: true,
  legible: true,
  full_name: 'Nguyễn Văn An',
  school: 'ĐH Bách Khoa',
  student_id: 'SE184218',
  expiry_year: 2028,
  reason: 'Thẻ sinh viên rõ ràng.',
  ...over,
})

const decide = (reading, over = {}) =>
  decideHssv({
    reading,
    currentYear: 2026,
    accountName: 'Nguyen Van An',
    duplicateOnOtherAccount: false,
    ...over,
  })

describe('normalizeStudentId', () => {
  it('chỉ giữ chữ và số, viết hoa', () => {
    expect(normalizeStudentId('se 18-4218')).toBe('SE184218')
  })
  it('quá ngắn hoặc rỗng thì coi như không đọc được', () => {
    expect(normalizeStudentId('12')).toBeNull()
    expect(normalizeStudentId('')).toBeNull()
    expect(normalizeStudentId(null)).toBeNull()
  })
})

describe('so tên', () => {
  it('bỏ dấu, không phân biệt hoa thường', () => {
    expect(normalizeName('  Nguyễn  Văn Đạt ')).toBe('nguyen van dat')
  })
  it('có ít nhất một từ chung thì KHÔNG coi là lệch (biệt danh hay gặp)', () => {
    expect(namesMismatch('Nguyễn Văn An', 'An Guitar')).toBe(false)
  })
  it('không từ nào chung thì lệch', () => {
    expect(namesMismatch('Nguyễn Văn An', 'Trần Thị Bình')).toBe(true)
  })
  it('thiếu tên một bên thì không kết luận', () => {
    expect(namesMismatch(null, 'Trần Thị Bình')).toBe(false)
    expect(namesMismatch('Nguyễn Văn An', '')).toBe(false)
  })
})

describe('decideHssv', () => {
  it('thẻ rõ, còn hạn, mã chưa ai dùng → tự duyệt', () => {
    const d = decide(good())
    expect(d.status).toBe('approved')
    expect(d.flags).toEqual([])
    expect(d.studentId).toBe('SE184218')
    expect(d.expiryYear).toBe(2028)
  })

  it('AI lỗi (không có kết quả) → chờ admin, KHÔNG từ chối khách thật', () => {
    const d = decide(null)
    expect(d.status).toBe('pending')
    expect(d.flags).toContain('ai_unavailable')
  })

  it('chắc chắn không phải thẻ → từ chối', () => {
    expect(decide(good({ is_student_card: false })).status).toBe('rejected')
  })

  it('thẻ hết hạn → từ chối', () => {
    const d = decide(good({ expiry_year: 2025 }))
    expect(d.status).toBe('rejected')
    expect(d.flags).toContain('expired')
  })

  it('hạn đúng năm nay vẫn hợp lệ', () => {
    expect(decide(good({ expiry_year: 2026 })).status).toBe('approved')
  })

  it('niên khoá dạng chuỗi "2027" cũng đọc được', () => {
    expect(decide(good({ expiry_year: '2027' })).status).toBe('approved')
  })

  it('mã trùng với tài khoản khác → TỪ CHỐI luôn, không cần admin', () => {
    const d = decide(good(), { duplicateOnOtherAccount: true })
    expect(d.status).toBe('rejected')
    expect(d.flags).toContain('duplicate_id')
  })

  it('lời nhắn khi trùng thẻ nói rõ thẻ đã dùng ở tài khoản khác và chỉ đường liên hệ admin', () => {
    const d = decide(good(), { duplicateOnOtherAccount: true })
    expect(d.message).toMatch(/đã được dùng.*tài khoản khác/i)
    expect(d.message).toMatch(/admin/i)
  })

  it('trùng thẻ mà ảnh mờ vẫn từ chối (mã đã đọc ra và khớp)', () => {
    expect(decide(good({ legible: false }), { duplicateOnOtherAccount: true }).status).toBe(
      'rejected'
    )
  })

  it('thẻ hết hạn được nêu lý do hết hạn, không nhầm thành trùng thẻ', () => {
    const d = decide(good({ expiry_year: 2025 }), { duplicateOnOtherAccount: true })
    expect(d.flags).toContain('expired')
    expect(d.flags).not.toContain('duplicate_id')
  })

  it('trùng thẻ và tên khác tài khoản → giữ cả hai cờ cho admin', () => {
    const d = decide(good({ full_name: 'Lê Hoàng Cường' }), { duplicateOnOtherAccount: true })
    expect(d.flags).toEqual(['duplicate_id', 'name_mismatch'])
  })

  it('không đọc được mã HS/SV → chờ admin (không dedupe được)', () => {
    const d = decide(good({ student_id: null }))
    expect(d.status).toBe('pending')
    expect(d.flags).toContain('no_student_id')
  })

  it('không đọc được hạn thẻ → chờ admin', () => {
    const d = decide(good({ expiry_year: null }))
    expect(d.status).toBe('pending')
    expect(d.flags).toContain('no_expiry')
  })

  it('ảnh mờ → chờ admin', () => {
    const d = decide(good({ legible: false }))
    expect(d.status).toBe('pending')
    expect(d.flags).toContain('unreadable')
  })

  it('AI không chắc có phải thẻ (null) → chờ admin, không từ chối', () => {
    const d = decide(good({ is_student_card: null }))
    expect(d.status).toBe('pending')
    expect(d.flags).toContain('card_uncertain')
  })

  it('tên thẻ khác tên tài khoản → vẫn duyệt nhưng gắn cờ cho admin', () => {
    const d = decide(good({ full_name: 'Lê Hoàng Cường' }))
    expect(d.status).toBe('approved')
    expect(d.flags).toEqual(['name_mismatch'])
  })

  it('cờ lệch tên được giữ cả khi lượt đang chờ admin', () => {
    const d = decide(good({ full_name: 'Lê Hoàng Cường', legible: false }))
    expect(d.status).toBe('pending')
    expect(d.flags).toEqual(expect.arrayContaining(['unreadable', 'name_mismatch']))
  })
})
