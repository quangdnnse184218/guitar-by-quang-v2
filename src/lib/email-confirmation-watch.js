/**
 * Chờ khách bấm liên kết xác nhận trong email rồi báo cho trang đăng ký để tự đăng nhập.
 *
 * Vì sao phải hỏi lại định kỳ: khách thường mở email trên MỘT thiết bị/tab khác (điện thoại, ứng
 * dụng Gmail…), nên trang đăng ký không nhận được phiên đăng nhập qua trình duyệt. Cách chắc chắn
 * nhất là thử đăng nhập lại bằng chính email + mật khẩu vừa nhập: chưa xác nhận thì Supabase trả
 * "Email not confirmed", xác nhận rồi thì đăng nhập thành công.
 *
 * Giữ số lần gọi ở mức thấp vì Supabase giới hạn số lần đăng nhập theo IP (429): hỏi thưa dần
 * theo thời gian, và tự lùi thêm khi gặp 429. Mật khẩu chỉ nằm trong bộ nhớ của hàm `signIn`
 * do trang đăng ký truyền vào — module này không nhìn thấy, không lưu nó ở đâu.
 */

export const DEFAULT_SCHEDULE = [
  { untilMs: 3 * 60_000, everyMs: 12_000 },
  { untilMs: 15 * 60_000, everyMs: 20_000 },
  { untilMs: 30 * 60_000, everyMs: 45_000 },
]
export const RATE_LIMIT_PENALTY_MS = 45_000
export const MAX_UNEXPECTED_ERRORS = 4

/** Khoảng chờ tới lần hỏi kế tiếp, hoặc null nếu đã quá thời gian chờ tối đa. */
export function nextDelay(elapsedMs, schedule = DEFAULT_SCHEDULE) {
  const step = schedule.find((s) => elapsedMs < s.untilMs)
  return step ? step.everyMs : null
}

/**
 * Phân loại lỗi của signInWithPassword:
 *  - 'unconfirmed'  : đúng tài khoản nhưng CHƯA bấm xác nhận → cứ tiếp tục chờ
 *  - 'rate_limited' : bị giới hạn tốc độ → chờ lâu hơn
 *  - 'transient'    : lỗi mạng/máy chủ tạm thời → thử lại, không tính là lỗi thật
 *  - 'other'        : lỗi khác (vd sai thông tin đăng nhập) → nhiều lần liên tiếp thì dừng hẳn
 */
export function classifySignInError(error) {
  if (!error) return 'other'
  const msg = String(error.message || '').toLowerCase()
  const code = String(error.code || '').toLowerCase()
  if (msg.includes('email not confirmed') || code === 'email_not_confirmed') return 'unconfirmed'
  if (
    error.status === 429 ||
    code === 'over_request_rate_limit' ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return 'rate_limited'
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    error.status >= 500 ||
    msg.includes('failed to fetch') ||
    msg.includes('network')
  ) {
    return 'transient'
  }
  return 'other'
}

/**
 * @param {object} opts
 * @param {() => Promise<{data?: {session?: object}, error?: object}>} opts.signIn
 *        Thử đăng nhập một lần (trang đăng ký giữ email+mật khẩu trong hàm này).
 * @param {(session: object) => void} opts.onConfirmed   Đã xác nhận và đăng nhập được.
 * @param {() => void} [opts.onGiveUp]                   Hết thời gian chờ tối đa.
 * @param {(error: object) => void} [opts.onProblem]     Lỗi bất thường lặp lại, không chờ nữa.
 * @returns {{ checkNow: () => Promise<void>, stop: () => void }}
 */
export function watchEmailConfirmation({
  signIn,
  onConfirmed,
  onGiveUp = () => {},
  onProblem = () => {},
  schedule = DEFAULT_SCHEDULE,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const startedAt = now()
  let stopped = false
  let checking = false
  let timer = null
  let unexpected = 0
  let penaltyMs = 0

  function stop() {
    stopped = true
    if (timer !== null) clearTimer(timer)
    timer = null
  }

  function scheduleNext() {
    if (stopped) return
    const delay = nextDelay(now() - startedAt, schedule)
    if (delay === null) {
      stop()
      onGiveUp()
      return
    }
    timer = setTimer(check, delay + penaltyMs)
    penaltyMs = 0
  }

  async function check() {
    if (stopped || checking) return
    checking = true
    if (timer !== null) clearTimer(timer)
    timer = null

    let outcome
    let lastError
    try {
      const { data, error } = await signIn()
      if (!error && data?.session) {
        checking = false
        stop()
        onConfirmed(data.session)
        return
      }
      lastError = error
      outcome = classifySignInError(error)
    } catch (err) {
      // fetch bị đứt (mất mạng…): không phải lỗi của tài khoản.
      lastError = err
      outcome = 'transient'
    }
    checking = false
    if (stopped) return

    if (outcome === 'other') {
      unexpected++
      if (unexpected >= MAX_UNEXPECTED_ERRORS) {
        stop()
        onProblem(lastError)
        return
      }
    } else {
      unexpected = 0
    }
    if (outcome === 'rate_limited') penaltyMs = RATE_LIMIT_PENALTY_MS

    scheduleNext()
  }

  scheduleNext()
  return { checkNow: check, stop }
}
