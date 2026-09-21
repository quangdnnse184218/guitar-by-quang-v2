/** Chuyển trang. Tách riêng thành một hàm để test có thể thay thế (jsdom không cho ghi đè location). */
export function redirectTo(url) {
  window.location.href = url
}
