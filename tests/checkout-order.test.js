/**
 * Test cho đường đi của TIỀN (src/lib/checkout-order.js) — phần rủi ro nhất
 * của dự án: tạo đơn hàng, dựng mã QR chuyển khoản, và theo dõi tới lúc
 * SePay webhook báo đã thanh toán.
 *
 * Các bất biến cần khoá lại:
 * - Mã đơn phải đúng định dạng DH + 6 chữ số, vì Edge Function sepay-ipn dò
 *   mã trong nội dung chuyển khoản bằng regex /DH\d{6,}/ — sai định dạng là
 *   webhook không khớp được đơn và khách phải chờ cấp quyền thủ công.
 * - Số tiền nhúng vào QR phải đúng giá bài hát, vì webhook đối chiếu số tiền
 *   nhận được với số tiền của đơn trước khi cấp quyền.
 * - Lỗi tạo đơn không được làm vỡ giao diện thanh toán (có QR dự phòng).
 * - Ngừng theo dõi đơn khi khách đóng modal, tránh polling chạy ngầm mãi.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'

const mockSupabase = {
  from: vi.fn(),
  storage: { from: vi.fn() },
  functions: { invoke: vi.fn() },
}

vi.mock('../src/lib/supabase.js', () => ({ supabase: mockSupabase }))

/** Giả lập chuỗi .from('orders').insert(...).select().single() */
function mockInsertOrder(result) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  mockSupabase.from.mockReturnValue({ insert })
  return { insert, select, single }
}

/** Giả lập chuỗi .from('orders').select('status').eq(...).maybeSingle() */
function mockOrderStatus(sequence) {
  let call = 0
  const maybeSingle = vi.fn(async () => {
    const res = sequence[Math.min(call, sequence.length - 1)]
    call++
    return res
  })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  mockSupabase.from.mockReturnValue({ select })
  return { maybeSingle, soLanGoi: () => call }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildVietQrUrl', () => {
  it('nhúng đúng số tiền và mã đơn vào link ảnh QR', async () => {
    const { buildVietQrUrl } = await import('../src/lib/checkout-order.js')
    const url = buildVietQrUrl(239000, 'DH482913')

    expect(url).toContain('amount=239000')
    expect(url).toContain('addInfo=DH482913')
  })

  it('mã hoá nội dung chuyển khoản để không vỡ URL', async () => {
    const { buildVietQrUrl } = await import('../src/lib/checkout-order.js')
    const url = buildVietQrUrl(1000, 'DH 123 456')

    expect(url).not.toContain('addInfo=DH 123 456')
    expect(url).toContain('addInfo=DH%20123%20456')
  })
})

describe('createOrderAndBuildQr', () => {
  it('sinh mã đơn đúng định dạng webhook sepay-ipn dò được (DH + 6 chữ số)', async () => {
    mockInsertOrder({ data: { id: 'order-1' }, error: null })
    const { createOrderAndBuildQr } = await import('../src/lib/checkout-order.js')

    const res = await createOrderAndBuildQr('user-1', { id: 'tab-1', price: 239000 })

    expect(res.orderCode).toMatch(/^DH\d{6}$/)
    expect(res.error).toBeNull()
  })

  it('ghi đúng dữ liệu đơn hàng vào bảng orders', async () => {
    const { insert } = mockInsertOrder({ data: { id: 'order-1' }, error: null })
    const { createOrderAndBuildQr } = await import('../src/lib/checkout-order.js')

    await createOrderAndBuildQr('user-1', { id: 7, price: '239000' })

    expect(mockSupabase.from).toHaveBeenCalledWith('orders')
    const payload = insert.mock.calls[0][0]
    expect(payload.user_id).toBe('user-1')
    // song_id luôn ép về chuỗi vì cột song_id trong DB là text
    expect(payload.song_id).toBe('7')
    // amount phải là SỐ và đúng giá bài hát — webhook đối chiếu số tiền này
    expect(payload.amount).toBe(239000)
  })

  it('số tiền trên QR khớp đúng số tiền đã ghi vào đơn', async () => {
    const { insert } = mockInsertOrder({ data: { id: 'order-1' }, error: null })
    const { createOrderAndBuildQr } = await import('../src/lib/checkout-order.js')

    const res = await createOrderAndBuildQr('user-1', { id: 'tab-1', price: 179000 })

    expect(insert.mock.calls[0][0].amount).toBe(179000)
    expect(res.qrUrl).toContain('amount=179000')
    expect(res.qrUrl).toContain(`addInfo=${res.orderCode}`)
  })

  it('giá không hợp lệ được quy về 0 thay vì NaN làm hỏng link QR', async () => {
    const { insert } = mockInsertOrder({ data: { id: 'order-1' }, error: null })
    const { createOrderAndBuildQr } = await import('../src/lib/checkout-order.js')

    const res = await createOrderAndBuildQr('user-1', { id: 'tab-1', price: 'chưa nhập' })

    expect(insert.mock.calls[0][0].amount).toBe(0)
    expect(res.qrUrl).not.toContain('NaN')
  })

  it('tạo đơn lỗi thì vẫn trả QR dự phòng, không làm vỡ modal thanh toán', async () => {
    mockInsertOrder({ data: null, error: { message: 'RLS từ chối' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { createOrderAndBuildQr } = await import('../src/lib/checkout-order.js')

    const res = await createOrderAndBuildQr('user-1', { id: 'tab-1', price: 239000 })

    expect(res.orderCode).toBeNull()
    expect(res.qrUrl).toBe('/assets/qr.jpg')
    expect(res.error).toBeTruthy()
  })
})

describe('watchOrderPayment', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gọi onPaid ngay khi webhook đã đánh dấu đơn là đã thanh toán', async () => {
    mockOrderStatus([{ data: { status: 'paid' }, error: null }])
    const { watchOrderPayment } = await import('../src/lib/checkout-order.js')
    const onPaid = vi.fn()

    watchOrderPayment('DH482913', { onPaid })
    await vi.advanceTimersByTimeAsync(0)

    expect(onPaid).toHaveBeenCalledTimes(1)
  })

  it('đơn còn đang chờ thì chưa gọi onPaid và tiếp tục hỏi lại', async () => {
    const { soLanGoi } = mockOrderStatus([{ data: { status: 'pending' }, error: null }])
    const { watchOrderPayment } = await import('../src/lib/checkout-order.js')
    const onPaid = vi.fn()

    watchOrderPayment('DH482913', { onPaid, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(onPaid).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(3000)
    expect(onPaid).not.toHaveBeenCalled()
    // Đã hỏi lại nhiều lần chứ không dừng sau lần đầu
    expect(soLanGoi()).toBeGreaterThan(1)
  })

  it('stop() dừng hẳn việc hỏi lại khi khách đóng modal', async () => {
    const { soLanGoi } = mockOrderStatus([{ data: { status: 'pending' }, error: null }])
    const { watchOrderPayment } = await import('../src/lib/checkout-order.js')
    const onPaid = vi.fn()

    const stop = watchOrderPayment('DH482913', { onPaid, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    const soLanTruocKhiDung = soLanGoi()

    stop()
    await vi.advanceTimersByTimeAsync(10000)

    expect(soLanGoi()).toBe(soLanTruocKhiDung)
    expect(onPaid).not.toHaveBeenCalled()
  })

  it('tự dừng sau khi quá hạn chờ, không polling vô tận', async () => {
    const { soLanGoi } = mockOrderStatus([{ data: { status: 'pending' }, error: null }])
    const { watchOrderPayment } = await import('../src/lib/checkout-order.js')
    const onPaid = vi.fn()

    watchOrderPayment('DH482913', { onPaid, intervalMs: 1000, timeoutMs: 3000 })
    await vi.advanceTimersByTimeAsync(10000)
    const soLanSauHetHan = soLanGoi()

    await vi.advanceTimersByTimeAsync(10000)
    expect(soLanGoi()).toBe(soLanSauHetHan)
    expect(onPaid).not.toHaveBeenCalled()
  })

  it('không có mã đơn thì không gọi mạng, trả về hàm dừng rỗng', async () => {
    const { watchOrderPayment } = await import('../src/lib/checkout-order.js')
    const onPaid = vi.fn()

    const stop = watchOrderPayment(null, { onPaid })
    await vi.advanceTimersByTimeAsync(5000)

    expect(mockSupabase.from).not.toHaveBeenCalled()
    expect(onPaid).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })
})

describe('uploadAndVerifyHssvCard', () => {
  it('lưu ảnh vào đúng thư mục mang ID của chính người dùng (chống IDOR)', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null })
    mockSupabase.storage.from.mockReturnValue({ upload })
    mockSupabase.functions.invoke.mockResolvedValue({ data: { approved: true }, error: null })
    const { uploadAndVerifyHssvCard } = await import('../src/lib/checkout-order.js')

    await uploadAndVerifyHssvCard('user-1', 'order-9', { name: 'the.JPG', type: 'image/jpeg' })

    expect(mockSupabase.storage.from).toHaveBeenCalledWith('hssv-cards')
    const [path] = upload.mock.calls[0]
    expect(path).toBe('user-1/order-9.jpg')
    // Edge Function nhận đúng path vừa upload để kiểm tra lại quyền sở hữu
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('verify-hssv-card', {
      body: { orderId: 'order-9', imagePath: 'user-1/order-9.jpg' },
    })
  })

  it('upload lỗi thì không gọi AI và báo chưa được duyệt', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'quá dung lượng' } })
    mockSupabase.storage.from.mockReturnValue({ upload })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { uploadAndVerifyHssvCard } = await import('../src/lib/checkout-order.js')

    const res = await uploadAndVerifyHssvCard('user-1', 'order-9', {
      name: 'the.png',
      type: 'image/png',
    })

    expect(res.approved).toBe(false)
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled()
  })
})
