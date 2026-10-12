/**
 * Kiểm tra mật khẩu đã từng lộ trong các vụ rò rỉ dữ liệu hay chưa (Have I Been Pwned).
 *
 * Supabase có sẵn tính năng này nhưng chỉ ở gói trả phí, nên trang tự kiểm ở phía trình duyệt bằng
 * cơ chế k-anonymity: chỉ gửi đi 5 ký tự đầu của mã băm SHA-1, nhận về danh sách phần đuôi rồi tự so
 * — mật khẩu và mã băm đầy đủ KHÔNG rời khỏi máy người dùng.
 *
 * Đây là lớp nhắc nhở cho người dùng thật, không phải ranh giới bảo mật (gọi thẳng API thì bỏ qua
 * được). Mọi trục trặc (mất mạng, dịch vụ chậm, trình duyệt thiếu Web Crypto) đều coi như "chưa lộ"
 * để không bao giờ chặn nhầm việc đăng ký / đổi mật khẩu.
 */

const RANGE_URL = 'https://api.pwnedpasswords.com/range/'

export const PWNED_PASSWORD_MESSAGE =
  'Mật khẩu này đã xuất hiện trong các vụ rò rỉ dữ liệu nên rất dễ bị đoán. Vui lòng chọn mật khẩu khác.'

async function sha1Hex(text) {
  const buffer = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/**
 * @param {string} password
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 *   `fetchImpl` chỉ để test truyền bản giả. Khi chạy test mà không truyền thì bỏ qua hẳn, để các
 *   test của luồng đăng ký / đổi mật khẩu không gọi ra mạng thật.
 * @returns {Promise<boolean>} true khi chắc chắn mật khẩu nằm trong danh sách đã lộ.
 */
export async function isPasswordPwned(password, { fetchImpl, timeoutMs = 2500 } = {}) {
  if (!password) return false
  if (!fetchImpl && import.meta.env?.MODE === 'test') return false
  const doFetch = fetchImpl || globalThis.fetch
  if (!doFetch || !globalThis.crypto?.subtle) return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const res = await doFetch(RANGE_URL + prefix, {
      signal: controller.signal,
      headers: { 'Add-Padding': 'true' },
    })
    if (!res.ok) return false
    const body = await res.text()
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':')
      // Dòng đệm (Add-Padding) có số lần xuất hiện là 0 — không phải mật khẩu thật.
      return candidate === suffix && Number(count) > 0
    })
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
