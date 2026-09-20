/**
 * ==============================================================================
 * ADMIN DASHBOARD — ROUTER THEO HASH
 * ==============================================================================
 * Bảng quản trị trước đây là 4 tab ẩn/hiện bằng biến trong JS: F5 là mất tab
 * đang xem, nút Back của trình duyệt nhảy ra khỏi trang, và không gửi link
 * "mở đúng trang Đơn hàng" cho ai được.
 *
 * Ở đây mỗi mục quản trị là một route thật (`#/don-hang`, `#/thanh-vien/<uuid>`)
 * nên vẫn là một trang HTML duy nhất — không phải nhân bản 6 lần khối
 * sidebar/header như khi tách thành 6 file .html rời (đúng thứ đã gây lỗi lệch
 * header giữa các trang public trước đây) — mà vẫn có URL riêng, F5 giữ nguyên
 * vị trí, Back/Forward hoạt động, và link chia sẻ được.
 */

/**
 * Khai báo toàn bộ "trang" của admin. `section` là id khối HTML tương ứng,
 * `title`/`subtitle` đổ vào thanh tiêu đề, `nav` là mục sidebar được bôi sáng.
 */
export const ROUTES = {
  'tong-quan': {
    section: 'section-overview',
    nav: 'tong-quan',
    title: 'Tổng Quan',
    subtitle: 'Doanh thu, đơn hàng và sức khoẻ hệ thống trong một màn hình',
  },
  'kho-tab': {
    section: 'section-songs',
    nav: 'kho-tab',
    title: 'Kho Video Tab',
    subtitle: 'Thêm, sửa, sắp xếp các bài tab miễn phí và có phí',
  },
  'do-nghe': {
    section: 'section-gears',
    nav: 'do-nghe',
    title: 'Bộ Đồ Nghề',
    subtitle: 'Danh sách đàn, phụ kiện hiển thị ở trang chủ và trang Công Cụ',
  },
  'tien-ve': {
    section: 'section-payments',
    nav: 'tien-ve',
    title: 'Tiền Về',
    subtitle: 'Khoản tiền vào tài khoản chưa khớp đơn nào — gán cho đúng khách',
  },
  'duyet-hssv': {
    section: 'section-hssv',
    nav: 'duyet-hssv',
    title: 'Duyệt HSSV',
    subtitle: 'Xem lại thẻ học sinh/sinh viên khách nộp để giảm giá — ảnh tự xoá sau vài ngày',
  },
  'don-hang': {
    section: 'section-orders',
    nav: 'don-hang',
    title: 'Đơn Chờ Thanh Toán',
    subtitle: 'Đơn khách đã tạo nhưng chưa có tiền nào về — phần lớn là bỏ dở',
  },
  'cap-quyen': {
    section: 'section-grant',
    nav: 'cap-quyen',
    title: 'Cấp Quyền Thủ Công',
    subtitle: 'Mở tab cho khách khi thanh toán không tự khớp, hoặc để tặng tab',
  },
  'lich-su': {
    section: 'section-history',
    nav: 'lich-su',
    title: 'Lịch Sử Mở Khoá',
    subtitle: 'Mọi lượt mở khoá tự động, cấp tay và thu hồi đều ghi lại ở đây',
  },
  'thanh-vien': {
    section: 'section-users',
    nav: 'thanh-vien',
    title: 'Thành Viên',
    subtitle: 'Tra cứu học viên, xem chi tiết và cấp quyền cho từng người',
  },
  'thanh-vien-chi-tiet': {
    section: 'section-user-detail',
    nav: 'thanh-vien',
    title: 'Chi Tiết Thành Viên',
    subtitle: 'Hồ sơ, tab đang sở hữu, lịch sử đơn hàng và yêu thích',
    // Route này không có mục sidebar riêng — nó nằm dưới "Thành viên".
    hidden: true,
  },
  'cai-dat': {
    section: 'section-settings',
    nav: 'cai-dat',
    title: 'Cài Đặt Tài Khoản',
    subtitle: 'Hồ sơ, ảnh đại diện, mật khẩu và giao diện',
  },
}

export const DEFAULT_ROUTE = 'tong-quan'

/** Mọi id section được router quản lý — dùng để ẩn hết trước khi hiện 1 cái. */
const ALL_SECTIONS = [...new Set(Object.values(ROUTES).map((r) => r.section))]

let onEnter = () => {}
let current = { route: null, param: null }

/**
 * `#/thanh-vien/abc-123` → { route: 'thanh-vien', param: 'abc-123' }
 * Route con của thành viên được map sang key riêng để có tiêu đề riêng.
 */
function parseHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '')
  const [rawRoute, rawParam] = raw.split('/')
  const param = rawParam ? decodeURIComponent(rawParam) : null

  if (rawRoute === 'thanh-vien' && param) return { route: 'thanh-vien-chi-tiet', param }
  if (ROUTES[rawRoute]) return { route: rawRoute, param }
  return { route: DEFAULT_ROUTE, param: null }
}

/** Đổi trang. Việc render thực tế do sự kiện hashchange kích hoạt. */
export function navigate(route, param) {
  const key = route === 'thanh-vien-chi-tiet' ? 'thanh-vien' : route
  const hash = param ? `#/${key}/${encodeURIComponent(param)}` : `#/${key}`
  if (window.location.hash === hash) {
    // Cùng một hash thì hashchange không bắn — tự render lại cho chắc.
    render()
    return
  }
  window.location.hash = hash
}

export function getCurrentRoute() {
  return { ...current }
}

function setNavActive(navKey) {
  document.querySelectorAll('[data-route-link]').forEach((el) => {
    const isActive = el.dataset.routeLink === navKey
    el.classList.toggle('is-active', isActive)
    if (el.hasAttribute('aria-current') || isActive) {
      el.setAttribute('aria-current', isActive ? 'page' : 'false')
    }
  })
}

function render() {
  const { route, param } = parseHash()
  const config = ROUTES[route]
  current = { route, param }

  ALL_SECTIONS.forEach((id) => {
    document.getElementById(id)?.classList.toggle('hidden', id !== config.section)
  })

  setNavActive(config.nav)

  const titleEl = document.getElementById('page-title')
  const subtitleEl = document.getElementById('page-subtitle')
  if (titleEl) titleEl.textContent = config.title
  if (subtitleEl) subtitleEl.textContent = config.subtitle
  document.title = `${config.title} — Quản trị Guitar By Quang`

  // Đổi trang thì luôn về đầu trang, nếu không admin sẽ thấy trang mới bị
  // cuộn lơ lửng ở giữa theo vị trí cuộn của trang cũ.
  window.scrollTo({ top: 0, behavior: 'auto' })

  onEnter(route, param)
}

/**
 * @param {(route: string, param: string|null) => void} enterHandler
 *        Gọi mỗi lần vào một route — nơi nạp dữ liệu cho trang đó.
 */
export function initRouter(enterHandler) {
  onEnter = enterHandler || (() => {})

  document.querySelectorAll('[data-route-link]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault()
      navigate(el.dataset.routeLink)
    })
  })

  window.addEventListener('hashchange', render)

  // Vào trang chưa có hash → ghi hash mặc định để URL luôn phản ánh đúng chỗ
  // đang đứng (replaceState để không tạo thêm một bước Back vô nghĩa).
  if (!window.location.hash) {
    history.replaceState(null, '', `#/${DEFAULT_ROUTE}`)
  }

  render()
}
