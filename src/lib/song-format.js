/**
 * ==============================================================================
 * ĐỊNH DẠNG GIÁ & ƯU ĐÃI HIỂN THỊ TRÊN THẺ BÀI HÁT
 * ==============================================================================
 * Badge giá trên thẻ rất hẹp (nhất là ở lưới 2 cột trên mobile) nên giá luôn
 * được rút gọn về dạng "239k" thay vì "239.000đ". Dữ liệu giá trong bảng
 * `songs` do admin nhập tay nên có đủ kiểu: "239000", "239k", "239.000đ",
 * "Miễn phí", hoặc để trống — các hàm dưới đây quy hết về một dạng ngắn gọn.
 */

/**
 * Rút gọn giá về dạng "239k".
 * Quy ước: số >= 1000 hiểu là đồng (239000 -> "239k"); số < 1000 hiểu là admin
 * đã gõ tắt theo đơn vị nghìn (239 -> "239k").
 */
export function formatCompactPrice(val) {
  if (val === 0 || val === '0') return 'Miễn phí'
  if (!val && val !== 0) return '239k'
  const str = String(val).trim()
  if (!str || str.toLowerCase() === 'miễn phí' || str.toLowerCase() === 'free') return 'Miễn phí'
  if (str.toLowerCase().endsWith('k')) return str.toLowerCase()
  const numericOnly = Number(str.replace(/[^0-9]/g, ''))
  if (numericOnly >= 1000) {
    return `${Math.round(numericOnly / 1000)}k`
  }
  if (numericOnly > 0) {
    return `${numericOnly}k`
  }
  return str
}

/**
 * Rút gọn ghi chú ưu đãi HSSV về dạng "HSSV: 179k" để vừa badge trên thẻ.
 * Ghi chú dài (admin viết cả câu) sẽ được bóc lấy con số rồi dựng lại cho gọn.
 */
/**
 * Chỉ lấy giá ưu đãi HSSV dạng "179k" từ ghi chú admin nhập tay, để badge trên
 * thẻ hiện icon mũ tốt nghiệp + giá thay cho cả cụm chữ "HSSV: 179k". Lấy nhóm
 * số CUỐI CÙNG (ghi chú kiểu "HSSV 2026: 179k" không bị dính thành 2026179).
 * Trả '' khi không bóc được số — nơi gọi tự quay về hiện nguyên ghi chú.
 */
export function extractDiscountPrice(note) {
  if (!note) return ''
  const groups = String(note).match(/\d[\d.,]*/g)
  if (!groups) return ''
  const digits = groups[groups.length - 1].replace(/[^0-9]/g, '')
  return digits ? formatCompactPrice(digits) : ''
}

export function formatCompactDiscount(note) {
  if (!note) return 'HSSV: 179k'
  const str = String(note).trim()
  if (str.toLowerCase().includes('179')) return 'HSSV: 179k'
  if (str.length > 15) {
    const num = str.replace(/[^0-9]/g, '')
    if (num) return `HSSV: ${num.length >= 4 ? Math.round(Number(num) / 1000) : num}k`
  }
  return str
}
