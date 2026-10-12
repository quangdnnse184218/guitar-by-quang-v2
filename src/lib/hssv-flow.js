/**
 * KHỐI "GIÁ HỌC SINH / SINH VIÊN" TRONG HỘP THANH TOÁN — dùng chung cho trang chủ, Kho tab và
 * trang cá nhân. Trước đây mỗi trang chép một bản (HTML + JS) và đã lệch nhau: hai trong ba trang
 * không có ô đồng ý mà vẫn gửi "đã đồng ý" lên máy chủ. Giờ chỉ còn một nơi: module này tự dựng
 * nội dung vào `#modal-hssv-block` của trang.
 *
 * Hai lối:
 *  - SINH VIÊN có email trường (.edu.vn): đồng ý → nhập email → nhận mã 6 số → nhập mã → tải ảnh
 *    thẻ → AI đọc thẻ và so với email. Được duyệt thì đơn + mã QR đổi sang giá ưu đãi ngay.
 *  - HỌC SINH, hoặc sinh viên không có email trường: nhắn Zalo kèm mã đơn; admin duyệt tay
 *    (RPC admin_apply_hssv_price) và mã QR ở đây tự đổi (trang gọi applyPrice khi
 *    watchOrderPayment báo số tiền của đơn đã đổi).
 *
 * Xác minh theo TỪNG ĐƠN: mỗi lần mở hộp thanh toán là một đơn mới nên trang phải gọi reset().
 */
import {
  buildVietQrUrl,
  sendHssvEmailCode,
  checkHssvEmailCode,
  uploadAndVerifyHssvCard,
} from './checkout-order.js'

const ZALO_URL = 'https://zalo.me/0326768885'
const RESEND_WAIT_SEC = 60

const ERROR_TEXT = {
  invalid_email:
    'Email này không phải email trường (phải kết thúc bằng .edu.vn). Trường bạn không cấp email thì chọn mục bên cạnh để nhắn Zalo.',
  email_used:
    'Email trường này đã được dùng để giảm giá ở một tài khoản khác. Nếu đây là email của bạn, nhắn Zalo để được hỗ trợ.',
  wait: 'Mã vừa được gửi rồi, chờ một chút rồi gửi lại nhé.',
  too_many:
    'Bạn đã xin mã quá nhiều lần. Thử lại sau khoảng một giờ, hoặc nhắn Zalo để được duyệt tay.',
  send_failed: 'Chưa gửi được email. Kiểm tra lại địa chỉ rồi thử lại, hoặc nhắn Zalo.',
  mail_not_configured: 'Hệ thống gửi email đang trục trặc. Bạn nhắn Zalo để được duyệt tay nhé.',
  not_ready: 'Hệ thống xác minh đang trục trặc. Bạn nhắn Zalo để được duyệt tay nhé.',
  wrong_code: 'Mã chưa đúng.',
  code_expired: 'Mã đã hết hạn. Bấm "Gửi lại mã" để nhận mã mới.',
  too_many_attempts: 'Nhập sai quá 5 lần. Bấm "Gửi lại mã" để nhận mã mới.',
  email_not_verified:
    'Email trường chưa được xác nhận (hoặc đã quá 1 giờ). Xác nhận lại email rồi gửi ảnh thẻ.',
  consent_required: 'Bạn cần tick ô đồng ý trước.',
  already_paid: 'Đơn này đã được thanh toán.',
  order_not_found: 'Không tìm thấy đơn. Đóng hộp này rồi mở lại giúp mình.',
  network: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
}
const errorText = (code, fallback) =>
  ERROR_TEXT[code] || fallback || 'Có lỗi xảy ra, thử lại giúp mình nhé.'

const TONE = {
  muted: 'text-text-muted',
  ok: 'text-emerald-700 dark:text-emerald-300',
  wait: 'text-amber-700 dark:text-amber-300',
  bad: 'text-rose-700 dark:text-rose-300',
}

const INPUT =
  'block w-full min-h-[40px] px-3 rounded-xl bg-transparent border border-glass-border text-sm text-text-primary placeholder:text-text-faint focus:outline-none focus:border-accent-primary disabled:opacity-60'
const BTN =
  'min-h-[40px] px-4 rounded-xl bg-accent-solid text-white font-bold text-xs whitespace-nowrap transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed'
const BTN_GHOST =
  'min-h-[40px] px-4 rounded-xl border border-glass-border bg-glass-bg hover:bg-glass-bg-hover text-text-primary font-bold text-xs whitespace-nowrap transition-colors'
const TAB =
  'flex-1 min-h-[40px] px-2 rounded-lg text-xs font-bold text-text-muted transition-colors aria-selected:bg-glass-bg aria-selected:text-text-primary aria-selected:shadow-sm'

const TEMPLATE = `
  <label class="flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
    <input type="checkbox" id="modal-hssv-checkbox" class="w-4 h-4 rounded accent-accent-primary cursor-pointer flex-shrink-0">
    <span class="font-bold text-text-primary">Tôi là học sinh / sinh viên</span>
  </label>

  <div id="modal-hssv-upload-panel" class="hidden space-y-3 pt-1">
    <div role="tablist" aria-label="Cách nhận giá ưu đãi" class="flex gap-1 p-1 rounded-xl bg-text-primary/[0.06]">
      <button type="button" role="tab" id="hssv-tab-sv" aria-controls="hssv-pane-sv" aria-selected="true" class="${TAB}">Có email trường</button>
      <button type="button" role="tab" id="hssv-tab-zalo" aria-controls="hssv-pane-zalo" aria-selected="false" class="${TAB}">Nhắn Zalo</button>
    </div>

    <!-- SINH VIÊN: email trường + ảnh thẻ -->
    <div id="hssv-pane-sv" role="tabpanel" aria-labelledby="hssv-tab-sv" class="space-y-3">
      <label class="flex items-center gap-2.5 min-h-[40px] cursor-pointer select-none">
        <input type="checkbox" id="modal-hssv-consent" class="w-4 h-4 rounded accent-accent-primary cursor-pointer flex-shrink-0">
        <span class="text-text-primary">Tôi đồng ý với <a href="/chinh-sach-bao-mat.html#hssv" target="_blank" rel="noopener" class="text-accent-primary underline font-bold">Chính sách bảo mật</a></span>
      </label>

      <div class="space-y-1.5">
        <label for="hssv-email" class="block font-bold text-text-primary">Email trường (.edu.vn)</label>
        <div class="flex gap-2">
          <input type="email" id="hssv-email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" placeholder="ten.sv@truong.edu.vn" class="${INPUT} flex-1 min-w-0" />
          <button type="button" id="hssv-send-btn" disabled class="${BTN} flex-shrink-0">Gửi mã</button>
        </div>
      </div>

      <div id="hssv-code-row" class="hidden space-y-1.5">
        <label for="hssv-code" class="block font-bold text-text-primary">Mã 6 số trong email</label>
        <div class="flex gap-2">
          <input type="text" id="hssv-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" class="${INPUT} flex-1 min-w-0 font-mono tracking-[0.4em]" />
          <button type="button" id="hssv-check-btn" disabled class="${BTN} flex-shrink-0">Xác nhận</button>
        </div>
        <p class="text-text-muted">Không thấy thư thì xem mục Spam.</p>
      </div>

      <div id="hssv-card-row" class="hidden space-y-1.5">
        <label for="modal-hssv-file-input" class="block font-bold text-text-primary">Ảnh thẻ sinh viên còn hạn</label>
        <input type="file" accept="image/*" id="modal-hssv-file-input"
          class="block w-full text-xs text-text-muted file:mr-3 file:min-h-[40px] file:px-3 file:rounded-lg file:border-0 file:bg-accent-primary/15 file:text-accent-primary file:font-bold file:cursor-pointer cursor-pointer" />
        <button type="button" id="modal-hssv-verify-btn" disabled class="${BTN} w-full">Xác minh thẻ</button>
      </div>

      <p id="modal-hssv-status" role="status" class="hidden font-bold leading-relaxed"></p>
    </div>

    <!-- HỌC SINH / KHÔNG CÓ EMAIL TRƯỜNG: nhắn Zalo, admin duyệt tay -->
    <div id="hssv-pane-zalo" role="tabpanel" aria-labelledby="hssv-tab-zalo" class="hidden space-y-3">
      <p class="text-text-muted leading-relaxed">Nhắn Zalo cho Quang <strong class="text-text-primary">ảnh thẻ</strong> kèm <strong class="text-text-primary">mã đơn</strong> này. Duyệt xong, mã QR ở đây tự đổi giá — cứ để cửa sổ này mở.</p>
      <div class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-glass-border bg-glass-bg">
        <span class="text-text-muted">Mã đơn</span>
        <strong id="hssv-zalo-code" class="font-mono tabular-nums text-sm text-text-primary">đang tạo…</strong>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" id="hssv-zalo-copy" class="${BTN_GHOST} flex-1">Sao chép tin nhắn</button>
        <a id="hssv-zalo-open" href="${ZALO_URL}" target="_blank" rel="noopener noreferrer" class="${BTN} flex-1 inline-flex items-center justify-center">Mở Zalo</a>
      </div>
      <p id="hssv-zalo-status" role="status" class="hidden font-bold leading-relaxed"></p>
    </div>
  </div>
`

/**
 * @param {object} opts
 * @param {() => ({id:string, amount:number}|null)} opts.getOrder   đơn đang mở (null khi chưa tạo xong)
 * @param {() => string|null} opts.getUserId
 * @param {() => string} opts.getOrderCode  mã đơn hiển thị trên QR (DH######)
 * @param {() => string} [opts.getSongTitle]
 */
export function initHssvFlow({
  getOrder,
  getUserId,
  getOrderCode,
  getSongTitle = () => document.getElementById('modal-tab-title')?.textContent.trim() || '',
}) {
  const block = document.getElementById('modal-hssv-block')
  if (!block) return { reset() {}, orderReady() {}, applyPrice() {} }
  block.innerHTML = TEMPLATE

  const $ = (id) => block.querySelector('#' + id)
  const el = {
    toggle: $('modal-hssv-checkbox'),
    panel: $('modal-hssv-upload-panel'),
    tabSv: $('hssv-tab-sv'),
    tabZalo: $('hssv-tab-zalo'),
    paneSv: $('hssv-pane-sv'),
    paneZalo: $('hssv-pane-zalo'),
    consent: $('modal-hssv-consent'),
    email: $('hssv-email'),
    send: $('hssv-send-btn'),
    codeRow: $('hssv-code-row'),
    code: $('hssv-code'),
    check: $('hssv-check-btn'),
    cardRow: $('hssv-card-row'),
    file: $('modal-hssv-file-input'),
    verify: $('modal-hssv-verify-btn'),
    status: $('modal-hssv-status'),
    zaloCode: $('hssv-zalo-code'),
    zaloCopy: $('hssv-zalo-copy'),
    zaloStatus: $('hssv-zalo-status'),
  }

  // Trạng thái của ĐƠN đang mở
  let verifiedEmail = null // email trường đã xác nhận bằng mã
  let done = false // đã được giá ưu đãi
  let busy = false
  let cooldown = 0
  let cooldownTimer = null

  const say = (target, tone, text) => {
    target.className = 'font-bold leading-relaxed ' + TONE[tone]
    target.textContent = text
    target.classList.remove('hidden')
  }
  const hush = (target) => {
    target.classList.add('hidden')
    target.textContent = ''
  }
  const emailValue = () => el.email.value.trim().toLowerCase()
  const looksLikeEmail = () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue())

  const sync = () => {
    const agreed = el.consent.checked
    const ready = Boolean(getOrder()?.id)
    el.send.disabled =
      busy ||
      done ||
      !agreed ||
      !ready ||
      !looksLikeEmail() ||
      cooldown > 0 ||
      Boolean(verifiedEmail)
    el.send.textContent =
      cooldown > 0
        ? `Gửi lại (${cooldown}s)`
        : el.codeRow.classList.contains('hidden')
          ? 'Gửi mã'
          : 'Gửi lại mã'
    el.check.disabled = busy || done || !agreed || el.code.value.replace(/\D/g, '').length !== 6
    el.verify.disabled = busy || done || !agreed || !verifiedEmail || !el.file.files?.length
    el.email.disabled = done || Boolean(verifiedEmail)
  }

  const startCooldown = (sec) => {
    clearInterval(cooldownTimer)
    cooldown = Math.max(0, Math.ceil(sec))
    sync()
    if (!cooldown) return
    cooldownTimer = setInterval(() => {
      cooldown -= 1
      if (cooldown <= 0) clearInterval(cooldownTimer)
      sync()
    }, 1000)
  }

  const selectTab = (zalo) => {
    el.tabSv.setAttribute('aria-selected', String(!zalo))
    el.tabZalo.setAttribute('aria-selected', String(zalo))
    el.paneSv.classList.toggle('hidden', zalo)
    el.paneZalo.classList.toggle('hidden', !zalo)
  }

  /** Đổi giá + mã QR của hộp thanh toán sang số tiền mới. */
  function applyPrice(amount, { byAdmin = false } = {}) {
    const order = getOrder()
    const value = Number(amount)
    if (!order || !Number.isFinite(value) || value <= 0) return
    const lowered = value < Number(order.amount)
    order.amount = value

    const qrUrl = buildVietQrUrl(value, getOrderCode())
    const qrImg = document.getElementById('modal-qr-img')
    if (qrImg) qrImg.src = qrUrl
    const qrTrigger = document.getElementById('qr-preview-trigger')
    if (qrTrigger) {
      qrTrigger.onclick = () =>
        window.openImageModal?.(
          qrUrl,
          'Mã QR chuyển khoản TPBank (03970202801)',
          'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
        )
    }
    const priceEl = document.getElementById('modal-tab-price')
    if (priceEl) priceEl.textContent = `${value.toLocaleString('vi-VN')} VNĐ`
    const tag = document.getElementById('modal-discount-tag')
    if (tag) tag.textContent = lowered ? 'Đã áp giá HSSV' : ''

    if (!byAdmin) return
    // Số tiền đổi do admin: duyệt tay (giảm) hoặc thu hồi (tăng lại giá thường).
    if (lowered) {
      done = true
      el.toggle.checked = true
      el.panel.classList.remove('hidden')
      selectTab(true)
      say(
        el.zaloStatus,
        'ok',
        '✓ Quang đã duyệt. Mã QR đã đổi sang giá ưu đãi — bạn chuyển khoản theo mã mới nhé.'
      )
    } else {
      done = false
      say(el.zaloStatus, 'wait', 'Giá ưu đãi của đơn này đã được gỡ; mã QR trở lại giá thường.')
    }
    sync()
  }

  // ---- sự kiện
  el.toggle.addEventListener('change', () =>
    el.panel.classList.toggle('hidden', !el.toggle.checked)
  )
  el.tabSv.addEventListener('click', () => selectTab(false))
  el.tabZalo.addEventListener('click', () => selectTab(true))
  el.consent.addEventListener('change', sync)
  el.email.addEventListener('input', sync)
  el.file.addEventListener('change', sync)
  el.code.addEventListener('input', () => {
    el.code.value = el.code.value.replace(/\D/g, '').slice(0, 6)
    sync()
  })

  el.send.addEventListener('click', async () => {
    const order = getOrder()
    if (!order?.id || !el.consent.checked) return
    busy = true
    sync()
    say(el.status, 'muted', 'Đang gửi mã…')
    const res = await sendHssvEmailCode(order.id, emailValue(), { consent: true })
    busy = false
    if (res?.ok) {
      el.codeRow.classList.remove('hidden')
      el.code.value = ''
      say(el.status, 'ok', `Đã gửi mã tới ${emailValue()}. Mã có hiệu lực 10 phút.`)
      startCooldown(RESEND_WAIT_SEC)
      el.code.focus()
    } else {
      say(el.status, 'bad', errorText(res?.error))
      if (res?.error === 'wait' && res.retryAfterSec) startCooldown(res.retryAfterSec)
      else sync()
    }
  })

  el.check.addEventListener('click', async () => {
    const order = getOrder()
    if (!order?.id || !el.consent.checked) return
    busy = true
    sync()
    const email = emailValue()
    const res = await checkHssvEmailCode(order.id, email, el.code.value, { consent: true })
    busy = false
    if (res?.ok) {
      verifiedEmail = email
      clearInterval(cooldownTimer)
      cooldown = 0
      el.codeRow.classList.add('hidden')
      el.code.value = ''
      el.cardRow.classList.remove('hidden')
      say(el.status, 'ok', '✓ Đã xác nhận email trường. Giờ tải ảnh thẻ sinh viên lên.')
    } else {
      const left =
        res?.error === 'wrong_code' && Number.isFinite(res.attemptsLeft)
          ? ` Còn ${res.attemptsLeft} lần thử.`
          : ''
      say(el.status, 'bad', errorText(res?.error) + left)
      el.code.value = ''
    }
    sync()
  })

  el.verify.addEventListener('click', async () => {
    const order = getOrder()
    const userId = getUserId()
    const file = el.file.files?.[0]
    if (!order?.id || !userId || !file || !verifiedEmail || !el.consent.checked) return

    busy = true
    sync()
    el.verify.textContent = 'Đang xác minh…'
    say(el.status, 'muted', 'Đang đọc thẻ… chờ chút nhé')

    let result
    try {
      result = await uploadAndVerifyHssvCard(userId, order.id, file, {
        email: verifiedEmail,
        consent: true,
      })
    } catch (err) {
      console.error('Lỗi xác minh HSSV:', err)
      result = { approved: false, error: 'network' }
    }
    busy = false
    el.verify.textContent = 'Xác minh thẻ'

    if (result?.approved) {
      done = true
      applyPrice(result.newAmount || order.amount)
      say(el.status, 'ok', '✓ Đã xác minh! Mã QR đã đổi sang giá sinh viên.')
      el.verify.textContent = 'Đã xác minh ✓'
      el.file.disabled = true
    } else if (result?.status === 'pending') {
      say(
        el.status,
        'wait',
        `${result.reason || 'Yêu cầu của bạn đã chuyển cho admin xét duyệt.'} Bạn có thể chờ admin duyệt (mã QR sẽ tự đổi), hoặc chuyển khoản giá thường ngay để nhận tab.`
      )
      el.file.value = '' // gửi ảnh khác được; ảnh mới thay lượt cũ
      el.verify.textContent = 'Gửi ảnh khác'
    } else if (result?.error === 'email_not_verified') {
      // Quá 1 giờ kể từ lúc xác nhận email: làm lại bước email.
      verifiedEmail = null
      el.cardRow.classList.add('hidden')
      say(el.status, 'bad', errorText('email_not_verified'))
    } else {
      say(
        el.status,
        'bad',
        result?.reason ||
          ERROR_TEXT[result?.error] ||
          'Không xác minh được thẻ. Bạn thử ảnh khác, nhắn Zalo, hoặc thanh toán giá thường.'
      )
    }
    sync()
  })

  el.zaloCopy.addEventListener('click', async () => {
    const code = getOrderCode()
    const title = getSongTitle()
    const text = `Mình xin giá học sinh/sinh viên cho đơn ${code}${title ? ` (bài "${title}")` : ''}. Mình gửi ảnh thẻ kèm theo.`
    try {
      await navigator.clipboard.writeText(text)
      say(el.zaloStatus, 'ok', 'Đã sao chép. Mở Zalo, dán tin nhắn và gửi kèm ảnh thẻ.')
    } catch {
      say(
        el.zaloStatus,
        'muted',
        `Không sao chép được. Bạn nhắn Zalo kèm mã đơn ${code} và ảnh thẻ nhé.`
      )
    }
  })

  return {
    /** Gọi mỗi lần mở hộp thanh toán cho một bài. `available` = bài có giá HSSV hay không. */
    reset({ available }) {
      block.classList.toggle('hidden', !available)
      verifiedEmail = null
      done = false
      busy = false
      clearInterval(cooldownTimer)
      cooldown = 0
      el.toggle.checked = false
      el.panel.classList.add('hidden')
      selectTab(false)
      el.consent.checked = false
      el.email.value = ''
      el.code.value = ''
      el.file.value = ''
      el.file.disabled = false
      el.codeRow.classList.add('hidden')
      el.cardRow.classList.add('hidden')
      el.verify.textContent = 'Xác minh thẻ'
      el.zaloCode.textContent = 'đang tạo…'
      hush(el.status)
      hush(el.zaloStatus)
      sync()
    },
    /** Gọi khi đơn đã tạo xong (có mã đơn thật). */
    orderReady() {
      el.zaloCode.textContent = getOrderCode() || '—'
      sync()
    },
    applyPrice,
  }
}
