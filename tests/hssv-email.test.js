// Logic thuần của bước "email trường" (supabase/functions/verify-hssv-card/email.ts) + nhánh
// email trong decideHssv.
import { describe, it, expect } from 'vitest'
import {
  normalizeSchoolEmail,
  emailMatchesCard,
  canSendCode,
  activeCode,
  isEmailVerified,
  timingSafeEqualHex,
} from '../supabase/functions/verify-hssv-card/email.ts'
import { decideHssv } from '../supabase/functions/verify-hssv-card/decision.ts'

describe('normalizeSchoolEmail — chỉ nhận email trường .edu.vn', () => {
  it.each([
    ['quangdnnse184218@fpt.edu.vn', 'quangdnnse184218@fpt.edu.vn'],
    ['  20520123@GM.UIT.edu.vn ', '20520123@gm.uit.edu.vn'],
    ['an.nguyen@student.hust.edu.vn', 'an.nguyen@student.hust.edu.vn'],
  ])('%s → %s', (raw, out) => expect(normalizeSchoolEmail(raw)).toBe(out))

  it.each([
    'an@gmail.com',
    'an@fpt.edu', // đuôi .edu nước ngoài: đi đường Zalo
    'an@edu.vn', // không có tên trường
    'an@fpt.edu.vn.evil.com', // .edu.vn không nằm ở cuối
    'an@fptedu.vn',
    'an@@fpt.edu.vn',
    'an..b@fpt.edu.vn',
    'a b@fpt.edu.vn',
    '@fpt.edu.vn',
    '',
    null,
    undefined,
    'x'.repeat(250) + '@fpt.edu.vn',
  ])('từ chối %s', (raw) => expect(normalizeSchoolEmail(raw)).toBeNull())
})

describe('emailMatchesCard — so email với thẻ', () => {
  const card = { studentId: 'SE184218', fullName: 'Đoàn Nguyễn Nhật Quang' }

  it('email chứa mã SV → khớp chắc', () => {
    expect(emailMatchesCard('quangdnnse184218@fpt.edu.vn', card)).toBe('id')
    expect(emailMatchesCard('SE184218@fpt.edu.vn', card)).toBe('id')
  })

  it('mã có dấu gạch/khoảng trắng trên thẻ vẫn khớp', () => {
    expect(emailMatchesCard('se184218@fpt.edu.vn', { studentId: 'SE 184-218', fullName: null })).toBe('id')
  })

  it('email chỉ có phần số của mã (mã dài) → khớp', () => {
    expect(emailMatchesCard('20520123@gm.uit.edu.vn', { studentId: 'SV20520123', fullName: 'Trần Thị B' })).toBe('id')
  })

  it('không có mã nhưng có tên + chữ cái đầu → khớp theo tên', () => {
    expect(emailMatchesCard('quangdnn@fpt.edu.vn', card)).toBe('name')
  })

  it('không có mã nhưng có tên + họ → khớp theo tên', () => {
    expect(emailMatchesCard('quang.doan@hcmus.edu.vn', card)).toBe('name')
  })

  it('chỉ trùng TÊN gọi (rất phổ biến) là chưa đủ', () => {
    expect(emailMatchesCard('quang2003@fpt.edu.vn', card)).toBe('none')
  })

  it('email của người khác → không khớp', () => {
    expect(emailMatchesCard('tranthib2101999@hcmut.edu.vn', card)).toBe('none')
  })

  it('mã quá ngắn không được coi là khớp (dễ trùng ngẫu nhiên)', () => {
    expect(emailMatchesCard('nam1234@fpt.edu.vn', { studentId: '1234', fullName: 'Lê Văn Bình' })).toBe('none')
  })

  it('thẻ không đọc được tên lẫn mã → không khớp', () => {
    expect(emailMatchesCard('quangdnnse184218@fpt.edu.vn', { studentId: null, fullName: null })).toBe('none')
  })
})

describe('giới hạn gửi mã', () => {
  const now = Date.parse('2026-10-12T10:00:00Z')
  const at = (secAgo) => ({ created_at: new Date(now - secAgo * 1000).toISOString() })

  it('chưa xin lần nào → được gửi', () => {
    expect(canSendCode({ now, userRows: [], orderRows: [] })).toEqual({ ok: true })
  })

  it('vừa gửi cho đơn này 20 giây trước → chờ 40 giây nữa', () => {
    expect(canSendCode({ now, userRows: [at(20)], orderRows: [at(20)] })).toEqual({ ok: false, error: 'wait', retryAfterSec: 40 })
  })

  it('đủ 60 giây thì gửi lại được', () => {
    expect(canSendCode({ now, userRows: [at(61)], orderRows: [at(61)] })).toEqual({ ok: true })
  })

  it('5 mã trong một giờ (kể cả cho đơn khác) → chặn tới khi mã cũ nhất tròn 1 giờ', () => {
    const userRows = [at(3000), at(2400), at(1800), at(1200), at(600)]
    const r = canSendCode({ now, userRows, orderRows: [] })
    expect(r).toMatchObject({ ok: false, error: 'too_many' })
    expect(r.retryAfterSec).toBe(600)
  })

  it('mã xin từ hơn 1 giờ trước không tính vào giới hạn', () => {
    const userRows = [at(4000), at(3900), at(3800), at(3700), at(3650)]
    expect(canSendCode({ now, userRows, orderRows: [] })).toEqual({ ok: true })
  })
})

describe('chọn mã đang dùng / email đã xác nhận', () => {
  const now = Date.parse('2026-10-12T10:00:00Z')
  const row = (over) => ({
    id: 'c',
    email: 'a@fpt.edu.vn',
    code_hash: 'h',
    attempts: 0,
    created_at: new Date(now - 60_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
    verified_at: null,
    ...over,
  })

  it('lấy mã MỚI NHẤT còn hạn của đúng email', () => {
    const rows = [
      row({ id: 'cu', created_at: new Date(now - 300_000).toISOString() }),
      row({ id: 'moi', created_at: new Date(now - 30_000).toISOString() }),
      row({ id: 'email-khac', email: 'b@fpt.edu.vn', created_at: new Date(now - 1000).toISOString() }),
    ]
    expect(activeCode(rows, 'a@fpt.edu.vn', now).id).toBe('moi')
  })

  it('mã hết hạn hoặc đã dùng thì không lấy', () => {
    expect(activeCode([row({ expires_at: new Date(now - 1).toISOString() })], 'a@fpt.edu.vn', now)).toBeNull()
    expect(activeCode([row({ verified_at: new Date(now).toISOString() })], 'a@fpt.edu.vn', now)).toBeNull()
  })

  it('email được tính là đã xác nhận trong đúng 1 giờ', () => {
    const ok = [row({ verified_at: new Date(now - 59 * 60_000).toISOString() })]
    const old = [row({ verified_at: new Date(now - 61 * 60_000).toISOString() })]
    expect(isEmailVerified(ok, 'a@fpt.edu.vn', now)).toBe(true)
    expect(isEmailVerified(old, 'a@fpt.edu.vn', now)).toBe(false)
    expect(isEmailVerified(ok, 'b@fpt.edu.vn', now)).toBe(false)
    expect(isEmailVerified([row()], 'a@fpt.edu.vn', now)).toBe(false)
  })

  it('timingSafeEqualHex', () => {
    expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true)
    expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false)
    expect(timingSafeEqualHex('abc', 'abc123')).toBe(false)
  })
})

describe('decideHssv — nhánh email', () => {
  const year = 2026
  const good = { is_student_card: true, legible: true, full_name: 'Nguyen Van An', school: 'FPT', student_id: 'SE184218', expiry_year: 2028, reason: 'ok' }
  const base = { reading: good, currentYear: year, accountName: 'Nguyen Van An', duplicateOnOtherAccount: false }

  it('email khớp (mã hoặc tên) + thẻ tốt → duyệt', () => {
    expect(decideHssv({ ...base, emailMatch: 'id' }).status).toBe('approved')
    expect(decideHssv({ ...base, emailMatch: 'name' }).status).toBe('approved')
  })

  it('email không khớp → chờ admin với cờ email_mismatch và lời nhắn riêng', () => {
    const d = decideHssv({ ...base, emailMatch: 'none' })
    expect(d.status).toBe('pending')
    expect(d.flags).toEqual(['email_mismatch'])
    expect(d.message).toMatch(/Email trường chưa khớp/)
  })

  it('email đã dùng ở tài khoản khác → từ chối, kể cả khi thẻ hoàn hảo', () => {
    const d = decideHssv({ ...base, emailMatch: 'id', emailUsedByOtherAccount: true })
    expect(d.status).toBe('rejected')
    expect(d.flags).toEqual(['duplicate_email'])
  })

  it('thẻ hết hạn vẫn bị từ chối dù email khớp', () => {
    const d = decideHssv({ ...base, reading: { ...good, expiry_year: 2024 }, emailMatch: 'id' })
    expect(d.status).toBe('rejected')
  })

  it('AI lỗi (không có kết quả đọc) → chờ admin, không từ chối', () => {
    expect(decideHssv({ ...base, reading: null, emailMatch: null }).status).toBe('pending')
  })

  it('lượt không có email (admin duyệt tay / dữ liệu cũ) không bị gắn cờ lệch email', () => {
    expect(decideHssv(base)).toMatchObject({ status: 'approved', flags: [] })
  })
})
