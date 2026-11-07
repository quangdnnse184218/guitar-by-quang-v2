/**
 * Vòng đời đơn của hộp thanh toán (src/lib/checkout-session.js), dùng chung 3 trang.
 * Khoá lại: kết quả tạo đơn về muộn không được đè lên lượt mở mới; đóng hộp thì ngừng theo dõi.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }))

const { createCheckoutSession, QR_PREVIEW_TITLE } = await import('../src/lib/checkout-session.js')

function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

function okResult(code) {
  return { orderCode: code, qrUrl: `https://qr/${code}`, order: { id: `id-${code}`, amount: 1000 }, error: null }
}

function setup() {
  const pending = []
  const createOrder = vi.fn(() => {
    const d = deferred()
    pending.push(d)
    return d.promise
  })
  const stops = []
  const watchers = []
  const watchPayment = vi.fn((code, handlers) => {
    const stop = vi.fn()
    stops.push(stop)
    watchers.push({ code, handlers })
    return stop
  })
  const openImageModal = vi.fn()
  const session = createCheckoutSession({ createOrder, watchPayment, openImageModal })
  return { session, pending, createOrder, watchPayment, stops, watchers, openImageModal }
}

describe('createCheckoutSession', () => {
  it('chưa đăng nhập thì không tạo đơn', async () => {
    const { session, createOrder } = setup()
    expect(await session.start({ userId: null, tab: { id: 1 } })).toBeNull()
    expect(createOrder).not.toHaveBeenCalled()
  })

  it('tạo đơn xong: điền mã đơn + QR, báo trang, rồi bắt đầu theo dõi đúng đơn', async () => {
    const { session, pending, watchPayment, openImageModal } = setup()
    const syntaxEl = { textContent: '' }
    const qrImgEl = { src: '' }
    const qrTriggerEl = {}
    const onOrderReady = vi.fn()
    const p = session.start({ userId: 'u1', tab: { id: 1 }, els: { syntaxEl, qrImgEl, qrTriggerEl }, onOrderReady })
    pending[0].resolve(okResult('DH111111'))
    await p

    expect(syntaxEl.textContent).toBe('DH111111')
    expect(qrImgEl.src).toBe('https://qr/DH111111')
    expect(onOrderReady).toHaveBeenCalledTimes(1)
    expect(session.getOrder()).toEqual({ id: 'id-DH111111', amount: 1000 })
    expect(watchPayment).toHaveBeenCalledWith('DH111111', expect.any(Object))
    qrTriggerEl.onclick()
    expect(openImageModal).toHaveBeenCalledWith('https://qr/DH111111', QR_PREVIEW_TITLE, expect.any(String))
  })

  it('đơn của lượt mở cũ về muộn (khách đã chuyển sang bài khác) thì bị bỏ qua', async () => {
    const { session, pending, watchPayment } = setup()
    const syntaxEl = { textContent: '' }
    const first = session.start({ userId: 'u1', tab: { id: 1 }, els: { syntaxEl } })
    const second = session.start({ userId: 'u1', tab: { id: 2 }, els: { syntaxEl } })

    pending[1].resolve(okResult('DH222222'))
    await second
    pending[0].resolve(okResult('DH111111'))
    expect(await first).toBeNull()

    expect(syntaxEl.textContent).toBe('DH222222')
    expect(watchPayment).toHaveBeenCalledTimes(1)
    expect(watchPayment.mock.calls[0][0]).toBe('DH222222')
    expect(session.getOrder().id).toBe('id-DH222222')
  })

  it('đóng hộp trước khi tạo đơn xong thì không điền QR, không theo dõi', async () => {
    const { session, pending, watchPayment } = setup()
    const syntaxEl = { textContent: 'VIDEOTAB X' }
    const p = session.start({ userId: 'u1', tab: { id: 1 }, els: { syntaxEl } })
    session.cancel()
    pending[0].resolve(okResult('DH111111'))
    expect(await p).toBeNull()
    expect(syntaxEl.textContent).toBe('VIDEOTAB X')
    expect(watchPayment).not.toHaveBeenCalled()
  })

  it('đóng hộp khi đang theo dõi thì ngừng theo dõi', async () => {
    const { session, pending, stops } = setup()
    const p = session.start({ userId: 'u1', tab: { id: 1 } })
    pending[0].resolve(okResult('DH111111'))
    await p
    session.cancel()
    expect(stops[0]).toHaveBeenCalledTimes(1)
  })

  it('đã trả tiền: gọi onPaid và lần đóng hộp sau không gọi stop lần nữa', async () => {
    const { session, pending, watchers, stops } = setup()
    const onPaid = vi.fn()
    const p = session.start({ userId: 'u1', tab: { id: 1 }, onPaid })
    pending[0].resolve(okResult('DH111111'))
    await p
    watchers[0].handlers.onPaid()
    expect(onPaid).toHaveBeenCalledTimes(1)
    session.cancel()
    expect(stops[0]).not.toHaveBeenCalled()
  })

  it('tạo đơn lỗi (không có mã) thì không theo dõi; lỗi ném ra không thành unhandled rejection', async () => {
    const { session, pending, watchPayment } = setup()
    const p1 = session.start({ userId: 'u1', tab: { id: 1 } })
    pending[0].resolve({ orderCode: null, qrUrl: '/assets/qr.jpg', error: { message: 'x' } })
    expect(await p1).toBeNull()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p2 = session.start({
      userId: 'u1',
      tab: { id: 1 },
      onOrderReady: () => {
        throw new Error('boom')
      },
    })
    pending[1].resolve(okResult('DH333333'))
    expect(await p2).toBeNull()
    expect(watchPayment).not.toHaveBeenCalled()
  })

  it('reset() quên đơn đang mở, cancel() thì giữ (khối HSSV có thể còn đang dùng)', async () => {
    const { session, pending } = setup()
    const p = session.start({ userId: 'u1', tab: { id: 1 } })
    pending[0].resolve(okResult('DH111111'))
    await p
    session.cancel()
    expect(session.getOrder()).not.toBeNull()
    session.reset()
    expect(session.getOrder()).toBeNull()
  })
})
