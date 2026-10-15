/**
 * ==============================================================================
 * "KÍNH LỎNG" (liquid glass) — lớp nâng cấp cho hệ kính mờ có sẵn
 * ==============================================================================
 * Hiệu ứng gồm 3 tầng, tầng nào trình duyệt không làm được thì tự rơi về tầng thấp hơn:
 *
 *   1. Kính mờ + viền sáng lệch góc (CSS thuần, mọi trình duyệt) — nằm ở style.css, các biến
 *      --frost-*. Không cần JS.
 *   2. Vệt sáng bám theo ngón tay / con trỏ (file này) — đặt --lg-x / --lg-y cho vài thanh nổi.
 *   3. KHÚC XẠ thật: ảnh nền phía sau bị bẻ cong ở mép như một thấu kính (file này). Dùng bộ lọc SVG
 *      feDisplacementMap trong backdrop-filter — chỉ Chrome/Edge (Chromium) vẽ được; Safari và
 *      Firefox bỏ qua nên KHÔNG bật ở đó (tránh hỏng giao diện), chúng vẫn có tầng 1 và 2.
 *
 * Không dùng thư viện ngoài: các thư viện "liquid glass" hiện có đều là bản demo tự vẽ canvas cho
 * từng phần tử, nặng hơn mà kết quả giống hệt đoạn ngắn dưới đây.
 *
 * Chỉ gắn khúc xạ cho vài thanh nhỏ nổi lên trên nội dung (thanh tab trang cá nhân, nút chuyển
 * kiểu xem). Thẻ nội dung và thanh rộng cả chiều ngang không dùng: nhiều lớp
 * backdrop-filter chồng nhau làm giật máy yếu, và thanh quá dài thì mép bẻ cong trông lạ.
 */

/**
 * Thanh nhỏ nổi: được khúc xạ. KHÔNG gồm thanh dưới đáy điện thoại (.bottom-nav): nó là
 * position:fixed, và với phần tử fixed bộ lọc url() trong backdrop-filter làm cả phần tử không vẽ
 * ra (đã thử trong Chromium; sticky và absolute thì vẽ bình thường). Thanh đó vẫn có kính mờ +
 * viền sáng + vệt sáng bám ngón tay.
 */
const REFRACT_SELECTOR = '.dash-tabs, .view-toggle'
/** Thanh có vệt sáng bám theo con trỏ (gồm cả header, không khúc xạ). */
const LIVE_SELECTOR = '#main-nav, .bottom-nav, .dash-tabs, .view-toggle, .filter-bar'

const SVG_NS = 'http://www.w3.org/2000/svg'
const REFRACT_SCALE = 34 // px dịch tối đa ở mép
const EDGE_BAND = 26 // px bề dày vùng mép bị bẻ cong (tối đa; thanh thấp thì lấy nửa chiều cao)

/** Chromium (Chrome, Edge, Opera, Brave...) và người dùng không tắt độ trong suốt. */
export function supportsRefraction() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false
  const brands = navigator.userAgentData?.brands
  if (brands) return brands.some((b) => /Chromium/i.test(b.brand))
  // Trình duyệt cũ chưa có userAgentData: Chrome/Edge/Opera đều ghi 'Chrome/' trong UA; Safari (kể cả
  // Chrome trên iOS, vốn dùng WebKit) thì không.
  return /Chrome\//.test(navigator.userAgent)
}

/**
 * Bản đồ dịch chuyển cho feDisplacementMap: kênh R = dịch theo X, kênh G = dịch theo Y, 128 = đứng yên.
 * Ở sát mép trái/trên lấy điểm ảnh từ phía trong (R,G > 128), sát mép phải/dưới lấy từ phía ngoài
 * (< 128), giữa phần tử giữ nguyên — nhìn như một thấu kính lồi. Tính theo pixel thật nên thanh dài
 * hay ngắn thì vùng mép vẫn có bề dày như nhau.
 */
export function buildDisplacementMap(w, h) {
  const band = Math.min(EDGE_BAND, h / 2, w / 2)
  const gx = (a, b, c, d) =>
    `<stop offset="0" stop-color="${a}"/><stop offset="${b}" stop-color="${c}"/>` +
    `<stop offset="${1 - b}" stop-color="${c}"/><stop offset="1" stop-color="${d}"/>`
  const fx = (band / w).toFixed(4)
  const fy = (band / h).toFixed(4)
  return (
    `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs>` +
    `<linearGradient id="r" x1="0" x2="1" y1="0" y2="0">${gx('#ff0000', fx, '#800000', '#000000')}</linearGradient>` +
    `<linearGradient id="g" x1="0" x2="0" y1="0" y2="1">${gx('#00ff00', fy, '#008000', '#000000')}</linearGradient>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" fill="#000"/>` +
    `<rect width="${w}" height="${h}" fill="url(#r)"/>` +
    `<rect width="${w}" height="${h}" fill="url(#g)" style="mix-blend-mode:screen"/>` +
    `</svg>`
  )
}

let svgRoot = null
let counter = 0
const filterOf = new WeakMap() // phần tử -> { id, filter, image }

function ensureSvgRoot() {
  if (svgRoot) return svgRoot
  svgRoot = document.createElementNS(SVG_NS, 'svg')
  svgRoot.setAttribute('width', '0')
  svgRoot.setAttribute('height', '0')
  svgRoot.setAttribute('aria-hidden', 'true')
  svgRoot.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none'
  document.body.appendChild(svgRoot)
  return svgRoot
}

function setBackdrop(el, value) {
  el.style.setProperty('backdrop-filter', value)
  el.style.setProperty('-webkit-backdrop-filter', value)
}

/**
 * Tạo (hoặc cập nhật) bộ lọc khúc xạ đúng kích thước hiện tại của phần tử.
 *
 * Dùng đơn vị objectBoundingBox (vùng lọc = đúng khung phần tử): trong backdrop-filter, toạ độ
 * userSpaceOnUse KHÔNG tính từ góc phần tử mà từ gốc trang, nên vùng lọc rơi ra ngoài phần tử
 * và cả thanh biến mất. Bản đồ vẫn dựng theo pixel thật rồi được kéo vừa khít khung phần tử.
 */
function refreshRefraction(el) {
  const { width, height } = el.getBoundingClientRect()
  const w = Math.round(width)
  const h = Math.round(height)
  if (w < 40 || h < 24) return // đang ẩn (display:none) hoặc quá nhỏ

  let entry = filterOf.get(el)
  if (!entry) {
    const id = `lg-refract-${++counter}`
    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.setAttribute('id', id)
    filter.setAttribute('filterUnits', 'objectBoundingBox')
    filter.setAttribute('primitiveUnits', 'objectBoundingBox')
    filter.setAttribute('x', '0')
    filter.setAttribute('y', '0')
    filter.setAttribute('width', '1')
    filter.setAttribute('height', '1')
    filter.setAttribute('color-interpolation-filters', 'sRGB')

    const image = document.createElementNS(SVG_NS, 'feImage')
    image.setAttribute('x', '0')
    image.setAttribute('y', '0')
    image.setAttribute('width', '1')
    image.setAttribute('height', '1')
    image.setAttribute('preserveAspectRatio', 'none')
    image.setAttribute('result', 'map')

    const displace = document.createElementNS(SVG_NS, 'feDisplacementMap')
    displace.setAttribute('in', 'SourceGraphic')
    displace.setAttribute('in2', 'map')
    displace.setAttribute('scale', String(REFRACT_SCALE))
    displace.setAttribute('xChannelSelector', 'R')
    displace.setAttribute('yChannelSelector', 'G')

    filter.append(image, displace)
    ensureSvgRoot().appendChild(filter)
    entry = { id, filter, image, w: 0, h: 0 }
    filterOf.set(el, entry)
  }

  if (entry.w !== w || entry.h !== h) {
    entry.w = w
    entry.h = h
    entry.image.setAttribute(
      'href',
      'data:image/svg+xml;utf8,' + encodeURIComponent(buildDisplacementMap(w, h))
    )
  }

  // Khúc xạ + làm mờ nhẹ + tăng độ rực của ảnh nền (độ rực là thứ làm kính "lỏng" nhìn sống động).
  setBackdrop(el, `url(#${entry.id}) blur(7px) saturate(1.9) brightness(1.05)`)
  el.classList.add('lg-refracting')
}

function watchForRefraction(root) {
  const ro = 'ResizeObserver' in window ? new ResizeObserver((list) => list.forEach((e) => refreshRefraction(e.target))) : null
  const seen = new WeakSet()

  const scan = () => {
    root.querySelectorAll(REFRACT_SELECTOR).forEach((el) => {
      if (seen.has(el)) return
      seen.add(el)
      refreshRefraction(el)
      ro?.observe(el)
    })
  }
  scan()

  // Thanh dưới đáy và vài thành phần khác được dựng bằng JS sau khi tải trang.
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      scan()
    })
  }).observe(root, { childList: true, subtree: true })
}

/** Vệt sáng bám theo con trỏ trên các thanh nổi: đặt --lg-x/--lg-y (px, tính từ góc phần tử). */
function watchPointerSheen() {
  let frame = 0
  let pending = null
  const apply = () => {
    frame = 0
    if (!pending) return
    const { el, x, y } = pending
    el.style.setProperty('--lg-x', `${x}px`)
    el.style.setProperty('--lg-y', `${y}px`)
  }
  const onMove = (e) => {
    const el = e.target.closest?.(LIVE_SELECTOR)
    if (!el) return
    const r = el.getBoundingClientRect()
    pending = { el, x: e.clientX - r.left, y: e.clientY - r.top }
    if (!frame) frame = requestAnimationFrame(apply)
  }
  const onLeave = (e) => {
    const el = e.target.closest?.(LIVE_SELECTOR)
    if (!el || el.contains(e.relatedTarget)) return
    el.style.removeProperty('--lg-x')
    el.style.removeProperty('--lg-y')
  }
  document.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerout', onLeave, { passive: true })
  // Chạm trên điện thoại: vệt sáng hiện đúng chỗ ngón tay vừa chạm.
  document.addEventListener('pointerdown', onMove, { passive: true })
}

let started = false

export function initLiquidGlass() {
  if (started || typeof document === 'undefined') return
  started = true

  const refract = supportsRefraction()
  document.documentElement.dataset.glass = refract ? 'refract' : 'frost'

  const start = () => {
    watchPointerSheen()
    if (refract) watchForRefraction(document.body)
  }
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
}
