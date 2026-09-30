/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — CÔNG CỤ & GEARS CONTROLLER (cong-cu.js)
 * ==============================================================================
 */

import { initNavbarShrink, initMobileMenu, initHeaderOverlapFix } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllGears } from './lib/gears-service.js'
import { renderGearCard, setupGearShowMore } from './lib/gear-card.js'

initNavbarShrink()
initMobileMenu()
initThemeToggle()
initHeaderOverlapFix()

// Toast Notification Helper
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
let toastTimer = null

export function showToast(msg, type = 'success') {
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)

  const toastIcon = document.getElementById('toast-icon')

  // Clean message: strip leading checkmarks/crosses to avoid duplication
  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg

  // Reset and apply dedicated toast class
  toastNotification.className = `toast-${type} toast-visible`

  if (toastIcon) {
    if (type === 'error') {
      toastIcon.textContent = '✕'
      toastIcon.className = ''
    } else if (type === 'info') {
      toastIcon.textContent = 'i'
      toastIcon.className = ''
    } else {
      toastIcon.textContent = '✓'
      toastIcon.className = ''
    }
  }

  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('toast-visible')
  }, 4000)
}

window.showToast = showToast

const DEFAULT_GEARS = [
  {
    name: 'Đàn Guitar Enya Nova Go SP1',
    category: 'Guitar Carbon',
    description:
      'Cây đàn acoustic carbon dáng mỏng tích hợp loa hiệu ứng, action êm ái, bền bỉ với thời tiết.',
    price: '4.850.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/clover.jpg',
  },
  {
    name: 'Dây Đàn Elixir Phosphor Bronze',
    category: 'Phụ kiện',
    description:
      'Dây đàn phủ NANOWEB chống rỉ sét số 1, âm vang sáng, bấm êm tay, dùng cả năm vẫn bóng đẹp.',
    price: '380.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/elixer.jpg',
  },
  {
    name: 'Capo Guitar G7th Performance 3',
    category: 'Phụ kiện',
    description:
      'Capo công nghệ ART tự cân chỉnh lực kẹp, không bị rè phím, giữ chuẩn cao độ mọi phím đàn.',
    price: '850.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/capo.jpg',
  },
  {
    name: 'Micro Thu Âm AKG P120',
    category: 'Thiết bị thu âm',
    description:
      'Micro condenser thu âm tiếng mộc của thùng đàn rõ nét, bắt trọn từng tiếng gõ percussive fingerstyle.',
    price: '2.450.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/akg.jpg',
  },
  {
    name: 'Phần mềm Guitar Pro 8',
    category: 'Phần mềm soạn tab',
    description:
      'Công cụ soạn tab và luyện tập chuẩn quốc tế, hỗ trợ phát audio track mộc thực tế và loop đoạn khó.',
    price: 'Bản quyền',
    link: 'https://zalo.me/0326768885',
    image: '/assets/gp8.jpg',
  },
]

async function renderGears() {
  const gearsGrid = document.getElementById('gears-grid')
  if (!gearsGrid) return

  let gears = await fetchAllGears()
  if (!gears || gears.length === 0) {
    gears = DEFAULT_GEARS
  }

  const showMoreWrap = document.getElementById('gears-show-more-wrap')
  const showMoreBtn = document.getElementById('gears-show-more-btn')
  const showMoreText = document.getElementById('gears-show-more-text')
  const showMoreIcon = document.getElementById('gears-show-more-icon')

  gearsGrid.innerHTML = gears
    .map((gear, idx) => renderGearCard(gear, idx))
    .join('')

  setupGearShowMore({
    container: gearsGrid,
    wrap: showMoreWrap,
    btn: showMoreBtn,
    textEl: showMoreText,
    icon: showMoreIcon,
    total: gears.length,
  })
}

document.addEventListener('DOMContentLoaded', () => {
  renderGears()
})
