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
 * gọi Edge Function verify-hssv-card để AI đọc kỹ thẻ. Kết quả: approved (hạ giá
 * đơn xuống giá HSSV), pending (chờ admin duyệt) hoặc rejected. Hàm này chỉ được gọi
 * sau khi khách đã tick đồng ý dùng ảnh — Edge Function cũng từ chối nếu thiếu `consent`.
 * `zalo` là tuỳ chọn: lưu vào hồ sơ để admin liên lạc khi cần (không dùng để xác minh).
 */
export async function uploadAndVerifyHssvCard(userId, orderId, file, { zalo } = {}) {
  const rawExt = (file.name.split('.').pop() || '').toLowerCase()
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'jpg'
  // Mỗi lần tải dùng MỘT TÊN FILE MỚI (thêm mốc thời gian) thay vì ghi đè. Bucket
  // chỉ có quyền INSERT/SELECT cho khách (không có UPDATE), nên `upsert` lên file đã
  // tồn tại bị RLS chặn — khách đổi ảnh khác ngay trong cùng cửa sổ thanh toán sẽ luôn
  // thất bại. Ảnh cũ được Edge Function xoá khi lượt xác minh trỏ sang ảnh mới.
  const path = `${userId}/${orderId}-${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('hssv-cards')
    .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })

  if (uploadError) {
    console.error('Không tải được ảnh thẻ HSSV:', uploadError)
    return { approved: false, error: uploadError.message }
  }

  const cleanZalo = String(zalo ?? '').trim().slice(0, 200)
  if (cleanZalo) {
    // Best-effort: chưa chạy SQL (cột zalo chưa có) hoặc lỗi mạng thì bỏ qua,
    // không được làm hỏng bước xác minh.
    const { error: zaloError } = await supabase.from('profiles').update({ zalo: cleanZalo }).eq('id', userId)
    if (zaloError) console.warn('Không lưu được Zalo:', zaloError.message)
  }

  const { data, error } = await supabase.functions.invoke('verify-hssv-card', {
    body: { orderId, imagePath: path, consent: true },
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
