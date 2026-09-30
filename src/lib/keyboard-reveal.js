/**
 * Giữ ô đang nhập luôn nằm TRÊN bàn phím ảo của điện thoại.
 *
 * Vì sao bản cũ (chỉ gọi scrollIntoView) không đủ:
 * - iOS không thu nhỏ trang khi mở bàn phím, bàn phím chỉ đè lên. Trang ngắn (form
 *   đăng nhập/đăng ký căn giữa màn) không cuộn được nữa → ô mật khẩu kẹt dưới bàn phím.
 * - "block: center" căn theo cả màn hình, không trừ phần bàn phím đang che.
 * - Ô trong hộp thoại position: fixed thì cuộn trang cũng không làm hộp di chuyển.
 *
 * Cách làm: đo vùng còn nhìn thấy bằng visualViewport; khi bàn phím mở thì chừa khoảng
 * trống cuối trang đúng bằng chiều cao bàn phím (để trang cuộn được); rồi cuộn lần lượt
 * từ khung cuộn gần ô nhất ra ngoài (khung trong hộp thoại → chính hộp thoại cố định →
 * cả trang) cho tới khi ô nằm khoảng 1/3 phía trên vùng nhìn thấy.
 */

const FIELD_SELECTOR =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="range"]):not([type="file"]), textarea, select'

/** Bàn phím nhỏ hơn mức này thì coi như không mở (thanh công cụ trình duyệt co giãn). */
const KEYBOARD_MIN = 80
const MARGIN = 12

export function isTextField(el) {
  return el instanceof HTMLElement && el.matches(FIELD_SELECTOR) && !el.disabled && !el.readOnly
}

/** Vùng màn hình còn nhìn thấy (trừ bàn phím), theo toạ độ getBoundingClientRect. */
export function visibleBand(win = window) {
  const vv = win.visualViewport
  const top = vv ? vv.offsetTop : 0
  const height = vv ? vv.height : win.innerHeight
  return { top, bottom: top + height, height }
}

export function keyboardHeight(win = window) {
  const vv = win.visualViewport
  if (!vv) return 0
  const kb = win.innerHeight - vv.height - vv.offsetTop
  return kb >= KEYBOARD_MIN ? Math.round(kb) : 0
}

/** Header cố định đang hiện (trang công khai) che mép trên vùng nhìn thấy. */
function topInset(el, win) {
  if (el.closest('[role="dialog"], .modal-dialog')) return MARGIN
  const header = win.document.getElementById('main-nav')
  if (!header) return MARGIN
  const r = header.getBoundingClientRect()
  return r.bottom > 0 ? r.bottom + MARGIN : MARGIN
}

/**
 * Số px cần cuộn để ô nằm gọn trong vùng nhìn thấy (dương = cuộn xuống).
 * 0 nếu ô đã nhìn thấy đủ.
 */
export function revealDelta(el, win = window) {
  const band = visibleBand(win)
  const r = el.getBoundingClientRect()
  const bandTop = band.top + topInset(el, win)
  const bandBottom = band.bottom - MARGIN
  if (r.top >= bandTop && r.bottom <= bandBottom) return 0
  // Đặt ô ở khoảng 1/3 phía trên vùng nhìn thấy (còn chỗ thấy nút bấm bên dưới)
  const target = bandTop + Math.max(0, (bandBottom - bandTop - r.height) * 0.33)
  return Math.round(r.top - target)
}

function isScrollable(node, win) {
  const cs = win.getComputedStyle(node)
  return /(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1
}

/** Các lớp có thể cuộn từ trong ra ngoài: khung cuộn, hộp thoại cố định, rồi cả trang. */
function scrollLayers(el, win) {
  const layers = []
  for (let n = el.parentElement; n && n !== win.document.body; n = n.parentElement) {
    const cs = win.getComputedStyle(n)
    if (cs.position === 'fixed') {
      layers.push({ node: n, fixed: true })
      return layers // phần tử cố định không đi theo trang
    }
    if (isScrollable(n, win)) layers.push({ node: n, fixed: false })
  }
  layers.push({ node: null, fixed: false }) // cả trang
  return layers
}

const padded = new Set()

/** Hộp thoại cố định: thêm đệm dưới = bàn phím và cho cuộn, để kéo được ô lên. */
function padFixedLayer(node, kb) {
  if (!padded.has(node)) {
    node.dataset.kbPrevPadding = node.style.paddingBottom
    node.dataset.kbPrevOverflow = node.style.overflowY
    padded.add(node)
  }
  node.style.paddingBottom = `${kb}px`
  node.style.overflowY = 'auto'
}

function restoreFixedLayers() {
  padded.forEach((node) => {
    node.style.paddingBottom = node.dataset.kbPrevPadding || ''
    node.style.overflowY = node.dataset.kbPrevOverflow || ''
    delete node.dataset.kbPrevPadding
    delete node.dataset.kbPrevOverflow
  })
  padded.clear()
}

/** Khoảng trống cuối trang = chiều cao bàn phím (xem .kb-open trong style.css). */
function setPageSpacer(win, kb) {
  const root = win.document.documentElement
  root.style.setProperty('--kb-space', `${kb}px`)
  win.document.body.classList.toggle('kb-open', kb > 0)
}

export function revealField(el, win = window) {
  if (!isTextField(el) || win.document.activeElement !== el) return
  const kb = keyboardHeight(win)
  setPageSpacer(win, kb)

  for (const layer of scrollLayers(el, win)) {
    const delta = revealDelta(el, win)
    if (Math.abs(delta) < 2) return
    if (layer.node === null) {
      win.scrollBy(0, delta)
      return
    }
    if (layer.fixed) {
      if (kb === 0) continue
      padFixedLayer(layer.node, kb)
    }
    layer.node.scrollTop += delta
  }
}

export function initKeyboardReveal(win = window) {
  if (win.__gbqKeyboardReveal) return
  win.__gbqKeyboardReveal = true
  const doc = win.document
  let timers = []

  const schedule = (el) => {
    timers.forEach((t) => win.clearTimeout(t))
    // Bàn phím trượt lên mất ~250–400ms (iOS/Android): căn lại vài lần trong lúc đó
    timers = [60, 260, 520].map((ms) => win.setTimeout(() => revealField(el, win), ms))
  }

  doc.addEventListener('focusin', (e) => {
    if (isTextField(e.target)) schedule(e.target)
  })

  doc.addEventListener('focusout', () => {
    win.setTimeout(() => {
      if (isTextField(doc.activeElement)) return // chuyển sang ô khác
      setPageSpacer(win, 0)
      restoreFixedLayers()
    }, 150)
  })

  const vv = win.visualViewport
  if (vv) {
    const onViewport = () => {
      const active = doc.activeElement
      if (isTextField(active)) schedule(active)
      else if (keyboardHeight(win) === 0) {
        setPageSpacer(win, 0)
        restoreFixedLayers()
      }
    }
    vv.addEventListener('resize', onViewport)
  }
}
