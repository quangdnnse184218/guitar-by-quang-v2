/**
 * Hộp "Đăng nhập để mua" cho khách bấm vào bài trả phí (trang chủ + Kho tab).
 * Ghi rõ đang mua BÀI NÀO, GIÁ BAO NHIÊU — trước chỉ hiện "Cần đăng nhập tài khoản"
 * nên khách bấm "Xem chi tiết" mà không thấy chi tiết gì. Đăng nhập/đăng ký xong
 * quay lại đúng bài đó (`/kho-tab.html?tab=<id>`).
 */
export function loginGateLinks(tabId) {
  const back = encodeURIComponent(`/kho-tab.html?tab=${encodeURIComponent(tabId)}`)
  return { login: `/login.html?redirect=${back}`, register: `/register.html?redirect=${back}` }
}

export function openLoginGate(tab, toggleModal) {
  const links = loginGateLinks(tab.id)
  const loginBtn = document.getElementById('auth-required-login-btn')
  const registerBtn = document.getElementById('auth-required-register-btn')
  if (loginBtn) loginBtn.href = links.login
  if (registerBtn) registerBtn.href = links.register

  const titleEl = document.getElementById('auth-required-song-title')
  const priceEl = document.getElementById('auth-required-song-price')
  // textContent: tên bài do admin nhập, không nhúng thẳng vào HTML
  if (titleEl) titleEl.textContent = tab.title || ''
  if (priceEl) priceEl.textContent = tab.price_formatted || tab.priceFormatted || ''

  toggleModal('auth-required-modal', true)
}
