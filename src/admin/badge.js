/**
 * Badge đỏ số đơn cần xử lý ở sidebar + thanh điều hướng dưới (mobile).
 *
 * Tách khỏi overview.js để orders.js và overview.js cùng gọi được mà không
 * import vòng nhau. Cập nhật mọi vị trí có `data-orders-badge` để hai chỗ
 * không bao giờ lệch số.
 */
export let pendingOrdersCount = 0

export function updateOrdersBadge(count = pendingOrdersCount) {
  pendingOrdersCount = count
  document.querySelectorAll('[data-orders-badge]').forEach((badge) => {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count)
      badge.classList.remove('hidden')
    } else {
      badge.classList.add('hidden')
    }
  })
}
