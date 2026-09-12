import { supabase } from './supabase.js'

/**
 * Tạo 1 đơn hàng "đang chờ thanh toán" trong bảng orders, kèm mã đơn hàng
 * riêng (vd DH482913) để đối chiếu khi SePay báo có tiền vào (xem Edge
 * Function sepay-ipn) — trước đây nội dung chuyển khoản chỉ dựa theo tên bài
 * hát (activeCheckoutSyntax), không phân biệt được ai mua nên phải cấp quyền
 * thủ công. Trả về URL ảnh QR VietQR đã nhúng sẵn số tiền + nội dung, khách
 * quét là app ngân hàng tự điền, không cần gõ tay.
 */
export function buildVietQrUrl(amount, orderCode) {
  return (
    `https://img.vietqr.io/image/TPBank-03970202801-compact2.png` +
    `?amount=${amount}&addInfo=${encodeURIComponent(orderCode)}` +
    `&accountName=${encodeURIComponent('DOAN NGUYEN NHAT QUANG')}`
  )
}

export async function createOrderAndBuildQr(userId, tab) {
  const orderCode = `DH${Math.floor(100000 + Math.random() * 900000)}`
  const amount = Number(tab.price) || 0

  const { data, error } = await supabase
    .from('orders')
    .insert({ order_code: orderCode, user_id: userId, song_id: String(tab.id), amount })
    .select()
    .single()

  if (error) {
    console.error('Không tạo được đơn hàng:', error)
    return {
      orderCode: null,
      qrUrl: '/assets/qr.jpg',
      error,
    }
  }

  return { orderCode, qrUrl: buildVietQrUrl(amount, orderCode), order: data, error: null }
}

/**
 * Upload ảnh thẻ HSSV lên bucket riêng tư "hssv-cards" (mỗi user chỉ đọc/ghi
 * được đúng thư mục {user_id}/ của mình — xem RLS trên storage.objects), rồi
 * gọi Edge Function verify-hssv-card để AI kiểm tra thẻ còn hiệu lực năm nay
 * không. Nếu hợp lệ, Edge Function tự hạ giá đơn hàng xuống giá HSSV.
 */
export async function uploadAndVerifyHssvCard(userId, orderId, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${userId}/${orderId}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('hssv-cards')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  if (uploadError) {
    console.error('Không tải được ảnh thẻ HSSV:', uploadError)
    return { approved: false, error: uploadError.message }
  }

  const { data, error } = await supabase.functions.invoke('verify-hssv-card', {
    body: { orderId, imagePath: path },
  })

  if (error) {
    console.error('Lỗi xác minh HSSV:', error)
    return { approved: false, error: error.message }
  }

  return data
}

/**
 * Theo dõi 1 đơn hàng đang chờ thanh toán bằng cách hỏi lại Supabase định kỳ
 * (không dùng Realtime subscription vì bảng orders chưa bật replication) —
 * gọi onPaid() ngay khi SePay webhook cập nhật status='paid'. Trả về hàm
 * stop() để hủy khi người dùng đóng modal hoặc rời trang trước khi kịp
 * thanh toán, tránh polling vô ích.
 */
export function watchOrderPayment(orderCode, { onPaid, intervalMs = 4000, timeoutMs = 20 * 60 * 1000 } = {}) {
  if (!orderCode) return () => {}

  let stopped = false
  let timer = null
  const startedAt = Date.now()

  async function tick() {
    if (stopped) return
    if (Date.now() - startedAt > timeoutMs) {
      stopped = true
      return
    }

    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('order_code', orderCode)
      .maybeSingle()

    if (stopped) return

    if (!error && data?.status === 'paid') {
      stopped = true
      onPaid()
      return
    }

    timer = setTimeout(tick, intervalMs)
  }

  tick()

  return function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

/**
 * Tải ảnh QR về máy — dùng fetch + blob thay vì thẻ <a download> trỏ thẳng
 * ra img.vietqr.io, vì thuộc tính download bị trình duyệt bỏ qua với ảnh
 * cross-origin (chỉ mở ảnh ra thay vì tải về).
 */
export async function downloadQrImage(qrUrl, filename = 'qr-chuyen-khoan-tab.png') {
  const res = await fetch(qrUrl)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
