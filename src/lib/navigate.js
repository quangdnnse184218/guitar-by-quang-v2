/** Chuyển trang. Tách riêng thành một hàm để test có thể thay thế (jsdom không cho ghi đè location). */
export function redirectTo(url) {
  window.location.href = url
}

/**
 * Đường dẫn quay lại sau khi đăng nhập (?redirect=...). Chỉ nhận đường dẫn NỘI BỘ:
 * "/kho-tab.html?tab=1" được, còn "//trang-la.com", "/\trang-la.com", "https://…",
 * "javascript:…" bị loại — nếu không, link đăng nhập có thể bị dùng để đẩy khách
 * sang trang giả mạo ngay sau khi họ nhập mật khẩu (open redirect).
 */
export function safeRedirectPath(raw, fallback = '/user-dashboard.html') {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return fallback
  const hasControlChar = [...raw].some((c) => c.charCodeAt(0) < 32)
  if (raw.startsWith('//') || raw.includes('\\') || hasControlChar) return fallback
  try {
    const url = new URL(raw, 'https://noi-bo.invalid')
    if (url.origin !== 'https://noi-bo.invalid') return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

/** Link tới trang đăng nhập/đăng ký kèm đường quay lại trang hiện tại (trừ trang chủ). */
export function withReturnTo(authPath) {
  const skip = ['/', '/index.html', '/login.html', '/register.html']
  if (skip.includes(window.location.pathname)) return authPath
  const here = window.location.pathname + window.location.search + window.location.hash
  return `${authPath}?redirect=${encodeURIComponent(here)}`
}
