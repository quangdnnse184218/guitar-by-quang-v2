import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  watchEmailConfirmation,
  nextDelay,
  classifySignInError,
  DEFAULT_SCHEDULE,
  RATE_LIMIT_PENALTY_MS,
  MAX_UNEXPECTED_ERRORS,
} from '../src/lib/email-confirmation-watch.js'

const unconfirmed = () => ({ error: { message: 'Email not confirmed', status: 400 } })
const ok = () => ({ data: { session: { access_token: 't' } }, error: null })

describe('classifySignInError', () => {
  it('nhận ra chưa xác nhận email', () => {
    expect(classifySignInError({ message: 'Email not confirmed' })).toBe('unconfirmed')
    expect(classifySignInError({ code: 'email_not_confirmed', message: 'x' })).toBe('unconfirmed')
  })
  it('nhận ra giới hạn tốc độ (429)', () => {
    expect(classifySignInError({ status: 429, message: 'x' })).toBe('rate_limited')
    expect(classifySignInError({ code: 'over_request_rate_limit', message: 'x' })).toBe(
      'rate_limited'
    )
  })
  it('lỗi mạng/máy chủ là tạm thời', () => {
    expect(classifySignInError({ name: 'AuthRetryableFetchError', message: 'x' })).toBe('transient')
    expect(classifySignInError({ status: 503, message: 'x' })).toBe('transient')
  })
  it('sai thông tin đăng nhập là lỗi khác', () => {
    expect(classifySignInError({ message: 'Invalid login credentials', status: 400 })).toBe('other')
    expect(classifySignInError(null)).toBe('other')
  })
})

describe('nextDelay', () => {
  it('hỏi thưa dần theo thời gian rồi dừng hẳn', () => {
    expect(nextDelay(0)).toBe(12_000)
    expect(nextDelay(4 * 60_000)).toBe(20_000)
    expect(nextDelay(20 * 60_000)).toBe(45_000)
    expect(nextDelay(31 * 60_000)).toBeNull()
  })
  it('tổng số lần hỏi trong 5 phút đầu đủ thấp để không chạm giới hạn 30 lần/5 phút của Supabase', () => {
    let t = 0
    let calls = 0
    while (t < 5 * 60_000) {
      t += nextDelay(t)
      calls++
    }
    expect(calls).toBeLessThan(28)
  })
})

describe('watchEmailConfirmation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function start(signIn, extra = {}) {
    const cb = { onConfirmed: vi.fn(), onGiveUp: vi.fn(), onProblem: vi.fn() }
    const w = watchEmailConfirmation({ signIn, ...cb, ...extra })
    return { w, ...cb }
  }

  it('chưa xác nhận thì cứ hỏi tiếp, xác nhận xong thì đăng nhập và dừng', async () => {
    const signIn = vi
      .fn()
      .mockResolvedValueOnce(unconfirmed())
      .mockResolvedValueOnce(unconfirmed())
      .mockResolvedValueOnce(ok())
    const { onConfirmed, onGiveUp } = start(signIn)

    await vi.advanceTimersByTimeAsync(12_000)
    expect(signIn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(signIn).toHaveBeenCalledTimes(2)
    expect(onConfirmed).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(12_000)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(onConfirmed.mock.calls[0][0]).toMatchObject({ access_token: 't' })

    // đã dừng: không hỏi thêm
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(signIn).toHaveBeenCalledTimes(3)
    expect(onGiveUp).not.toHaveBeenCalled()
  })

  it('không hỏi ngay lập tức lúc vừa đăng ký (tránh tốn lượt đăng nhập vô ích)', async () => {
    const signIn = vi.fn().mockResolvedValue(unconfirmed())
    start(signIn)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('checkNow() hỏi ngay (khi khách quay lại tab hoặc tab xác nhận báo tin)', async () => {
    const signIn = vi.fn().mockResolvedValue(ok())
    const { w, onConfirmed } = start(signIn)
    await w.checkNow()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
  })

  it('checkNow() gọi chồng lên lần hỏi đang chạy thì không sinh yêu cầu thứ hai', async () => {
    let resolve
    const signIn = vi.fn(() => new Promise((r) => (resolve = r)))
    const { w } = start(signIn)
    const a = w.checkNow()
    const b = w.checkNow()
    expect(signIn).toHaveBeenCalledTimes(1)
    resolve(unconfirmed())
    await Promise.all([a, b])
  })

  it('gặp giới hạn tốc độ thì lùi thêm rồi mới hỏi tiếp', async () => {
    const signIn = vi
      .fn()
      .mockResolvedValueOnce({ error: { status: 429, message: 'x' } })
      .mockResolvedValue(unconfirmed())
    start(signIn)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(signIn).toHaveBeenCalledTimes(1)
    // lần kế phải chờ 12s + phạt
    await vi.advanceTimersByTimeAsync(12_000)
    expect(signIn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_PENALTY_MS)
    expect(signIn).toHaveBeenCalledTimes(2)
  })

  it('mất mạng (fetch ném lỗi) không làm dừng việc chờ', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(ok())
    const { onConfirmed, onProblem } = start(signIn)
    await vi.advanceTimersByTimeAsync(12_000)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(onConfirmed).toHaveBeenCalledTimes(1)
    expect(onProblem).not.toHaveBeenCalled()
  })

  it(`lỗi bất thường ${MAX_UNEXPECTED_ERRORS} lần liên tiếp thì dừng và báo`, async () => {
    const signIn = vi
      .fn()
      .mockResolvedValue({ error: { message: 'Invalid login credentials', status: 400 } })
    const { onProblem, onConfirmed } = start(signIn)
    for (let i = 0; i < MAX_UNEXPECTED_ERRORS; i++) await vi.advanceTimersByTimeAsync(12_000)
    expect(onProblem).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledTimes(MAX_UNEXPECTED_ERRORS)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signIn).toHaveBeenCalledTimes(MAX_UNEXPECTED_ERRORS)
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('một lần "chưa xác nhận" xen giữa thì đếm lỗi bất thường bắt đầu lại từ đầu', async () => {
    const bad = { error: { message: 'Invalid login credentials', status: 400 } }
    const signIn = vi
      .fn()
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(unconfirmed())
      .mockResolvedValue(bad)
    const { onProblem } = start(signIn)
    for (let i = 0; i < 7; i++) await vi.advanceTimersByTimeAsync(12_000)
    expect(onProblem).not.toHaveBeenCalled()
  })

  it('quá thời gian chờ tối đa thì dừng hẳn và báo', async () => {
    const signIn = vi.fn().mockResolvedValue(unconfirmed())
    const { onGiveUp } = start(signIn)
    await vi.advanceTimersByTimeAsync(31 * 60_000)
    expect(onGiveUp).toHaveBeenCalledTimes(1)
    const calls = signIn.mock.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(signIn).toHaveBeenCalledTimes(calls)
  })

  it('stop() dừng ngay, kể cả khi đang có hẹn giờ', async () => {
    const signIn = vi.fn().mockResolvedValue(unconfirmed())
    const { w } = start(signIn)
    w.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(signIn).not.toHaveBeenCalled()
  })

  it('lịch mặc định thưa dần và hữu hạn', () => {
    expect(DEFAULT_SCHEDULE.map((s) => s.everyMs)).toEqual([12_000, 20_000, 45_000])
  })
})
