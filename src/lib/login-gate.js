/**
 * Khách chưa đăng nhập bấm vào bài trả phí (trang chủ + Kho tab): vẫn mở cửa sổ chi tiết
 * đầy đủ (video demo, thông số, giá) nhưng phần chuyển khoản/mã QR được thay bằng lời mời
 * đăng nhập. Đăng nhập/đăng ký xong quay lại đúng bài đó (`/kho-tab.html?tab=<id>`).
 * Đây chỉ là lớp giao diện: đơn hàng chỉ được tạo khi đã có phiên đăng nhập (xem
 * openCheckoutModal), và tab thật vẫn do RLS + bảng purchases bảo vệ.
 */
export function loginGateLinks(tabId) {
  const back = encodeURIComponent(`/kho-tab.html?tab=${encodeURIComponent(tabId)}`)
  return { login: `/login.html?redirect=${back}`, register: `/register.html?redirect=${back}` }
}

/**
 * Bật/tắt lời mời đăng nhập trong cửa sổ thanh toán.
 * @param {{id: string|number}} tab
 * @param {boolean} loggedIn
 */
export function applyCheckoutLoginGate(tab, loggedIn) {
  const gate = document.getElementById('checkout-login-gate')
  const payBlock = document.getElementById('checkout-pay-block')
  if (gate) gate.classList.toggle('hidden', loggedIn)
  if (payBlock) payBlock.classList.toggle('hidden', !loggedIn)
  if (loggedIn) return

  const links = loginGateLinks(tab.id)
  const loginBtn = document.getElementById('checkout-gate-login-btn')
  const registerBtn = document.getElementById('checkout-gate-register-btn')
  if (loginBtn) loginBtn.href = links.login
  if (registerBtn) registerBtn.href = links.register
}
