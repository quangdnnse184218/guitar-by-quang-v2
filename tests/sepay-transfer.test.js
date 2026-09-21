// Kiểm thử logic quyết định của webhook thanh toán (supabase/functions/sepay-ipn).
// Đây là đoạn quyết định "tự cấp tab hay không" cho tiền thật nên các nhánh đều
// được khoá lại, đặc biệt là nhánh khớp đơn phải giữ nguyên hành vi cũ.
import { describe, it, expect } from 'vitest'
import {
  parseTransfer,
  parseVietnamTime,
  extractOrderCode,
  decideTransfer,
  sanitizeRaw,
} from '../supabase/functions/sepay-ipn/transfer.ts'

const order = (over = {}) => ({
  id: 'o1',
  user_id: 'u1',
  song_id: 's1',
  amount: 239000,
  status: 'pending',
  ...over,
})

const transfer = (over = {}) => ({
  externalId: 't1',
  content: 'DH123456 mua tab',
  amount: 239000,
  direction: 'in',
  occurredAt: null,
  gateway: null,
  referenceCode: null,
  ...over,
})

describe('extractOrderCode', () => {
  it('tìm mã đơn không phân biệt hoa thường và lấy ở giữa nội dung', () => {
    expect(extractOrderCode('nguyen van a dh482913 mua tab')).toBe('DH482913')
  })

  it('cần ít nhất 6 chữ số', () => {
    expect(extractOrderCode('DH12345')).toBeNull()
  })

  it('không có mã thì trả null', () => {
    expect(extractOrderCode('chuyen tien an trua')).toBeNull()
  })
})

describe('parseVietnamTime', () => {
  it('hiểu giờ SePay theo UTC+7, không phải UTC', () => {
    // 14:02 giờ Việt Nam = 07:02 UTC
    expect(parseVietnamTime('2023-03-25 14:02:37')).toBe('2023-03-25T07:02:37.000Z')
  })

  it('giá trị rỗng hoặc sai định dạng thì trả null', () => {
    expect(parseVietnamTime('')).toBeNull()
    expect(parseVietnamTime(undefined)).toBeNull()
    expect(parseVietnamTime('không phải ngày')).toBeNull()
  })
})

describe('parseTransfer', () => {
  it('đọc payload SePay đầy đủ', () => {
    const t = parseTransfer({
      id: 92704,
      gateway: 'Vietcombank',
      transactionDate: '2023-03-25 14:02:37',
      content: 'DH123456',
      transferType: 'in',
      transferAmount: 239000,
      referenceCode: 'MBVCB.3278907687',
    })
    expect(t).toMatchObject({
      externalId: '92704',
      amount: 239000,
      direction: 'in',
      gateway: 'Vietcombank',
      referenceCode: 'MBVCB.3278907687',
      occurredAt: '2023-03-25T07:02:37.000Z',
    })
  })

  it('thiếu id thì dùng referenceCode làm mã giao dịch', () => {
    expect(parseTransfer({ referenceCode: 'ABC', transferAmount: 1 }).externalId).toBe('ABC')
  })

  it('payload thiếu trường không làm hàm ném lỗi', () => {
    const t = parseTransfer({})
    expect(t).toMatchObject({ externalId: null, amount: 0, direction: 'unknown', content: '' })
  })
})

describe('decideTransfer', () => {
  it('KHỚP: đơn đang chờ và tiền đủ giá → cấp tab (hành vi gốc, không được đổi)', () => {
    expect(decideTransfer(transfer(), 'DH123456', order())).toEqual({
      kind: 'match',
      orderCode: 'DH123456',
    })
  })

  it('khớp cả khi khách chuyển dư tiền', () => {
    expect(decideTransfer(transfer({ amount: 300000 }), 'DH123456', order()).kind).toBe('match')
  })

  it('đơn HSSV giá thấp vẫn khớp khi chuyển đúng giá thấp', () => {
    expect(
      decideTransfer(transfer({ amount: 179000 }), 'DH123456', order({ amount: 179000 })).kind
    ).toBe('match')
  })

  it('thiếu tiền → không cấp, ghi rõ amount_low', () => {
    expect(decideTransfer(transfer({ amount: 100000 }), 'DH123456', order())).toEqual({
      kind: 'unmatched',
      reason: 'amount_low',
      orderCode: 'DH123456',
    })
  })

  it('tiền vào KHÔNG có mã đơn → bỏ qua hoàn toàn (không liên quan tới web bán tab)', () => {
    expect(decideTransfer(transfer({ content: 'tien an' }), null, null)).toEqual({
      kind: 'ignore_unrelated',
    })
  })

  it('hướng không rõ mà không có mã đơn cũng bỏ qua', () => {
    expect(
      decideTransfer(transfer({ direction: 'unknown', content: 'chuyen tien' }), null, null).kind
    ).toBe('ignore_unrelated')
  })

  it('có mã nhưng không tồn tại đơn → order_not_found', () => {
    expect(decideTransfer(transfer(), 'DH999999', null)).toEqual({
      kind: 'unmatched',
      reason: 'order_not_found',
      orderCode: 'DH999999',
    })
  })

  it('đơn đã hết hạn (khách trả muộn) → order_expired, KHÔNG tự cấp tab', () => {
    expect(decideTransfer(transfer(), 'DH123456', order({ status: 'expired' })).kind).toBe(
      'unmatched'
    )
    expect(decideTransfer(transfer(), 'DH123456', order({ status: 'expired' })).reason).toBe(
      'order_expired'
    )
  })

  it('đơn đã trả mà tiền về thêm lần nữa → order_already_paid (cần hoàn tiền)', () => {
    expect(decideTransfer(transfer(), 'DH123456', order({ status: 'paid' }))).toMatchObject({
      kind: 'unmatched',
      reason: 'order_already_paid',
    })
  })

  it('tiền RA khỏi tài khoản không bao giờ được coi là thanh toán, dù có mã DH', () => {
    expect(decideTransfer(transfer({ direction: 'out' }), 'DH123456', order())).toEqual({
      kind: 'ignore_outgoing',
    })
  })

  it('hướng không rõ (payload thiếu transferType) vẫn xử lý như tiền vào', () => {
    expect(decideTransfer(transfer({ direction: 'unknown' }), 'DH123456', order()).kind).toBe(
      'match'
    )
  })
})

describe('sanitizeRaw', () => {
  it('bỏ số dư, số tài khoản và tài khoản ảo, giữ phần còn lại', () => {
    const out = sanitizeRaw({
      id: 9001,
      content: 'DH123456',
      transferAmount: 239000,
      accumulated: 5000000,
      accountNumber: '03970202801',
      subAccount: 'X1',
    })
    expect(out).toEqual({ id: 9001, content: 'DH123456', transferAmount: 239000 })
  })

  it('không làm hỏng payload thiếu các trường đó và không sửa đối tượng gốc', () => {
    const body = { id: 1, accumulated: 10 }
    sanitizeRaw(body)
    expect(body).toEqual({ id: 1, accumulated: 10 })
    expect(sanitizeRaw({ id: 1 })).toEqual({ id: 1 })
  })
})
