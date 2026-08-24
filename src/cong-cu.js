/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — CÔNG CỤ & GEARS CONTROLLER (cong-cu.js)
 * ==============================================================================
 */

import { initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllGears } from './lib/gears-service.js'

initNavbarShrink()
initMobileMenu()
initThemeToggle()

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
      toastIcon.textContent = '⟳'
      toastIcon.className = 'animate-spin'
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
    description: 'Cây đàn acoustic carbon dáng mỏng tích hợp loa hiệu ứng, action êm ái, bền bỉ với thời tiết.',
    price: '4.850.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/clover.jpg'
  },
  {
    name: 'Dây Đàn Elixir Phosphor Bronze',
    category: 'Phụ kiện',
    description: 'Dây đàn phủ NANOWEB chống rỉ sét số 1, âm vang sáng, bấm êm tay, dùng cả năm vẫn bóng đẹp.',
    price: '380.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/elixer.jpg'
  },
  {
    name: 'Capo Guitar G7th Performance 3',
    category: 'Phụ kiện',
    description: 'Capo công nghệ ART tự cân chỉnh lực kẹp, không bị rè phím, giữ chuẩn cao độ mọi phím đàn.',
    price: '850.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/capo.jpg'
  },
  {
    name: 'Micro Thu Âm AKG P120',
    category: 'Thiết bị thu âm',
    description: 'Micro condenser thu âm tiếng mộc của thùng đàn rõ nét, bắt trọn từng tiếng gõ percussive fingerstyle.',
    price: '2.450.000đ',
    link: 'https://zalo.me/0326768885',
    image: '/assets/akg.jpg'
  },
  {
    name: 'Phần mềm Guitar Pro 8',
    category: 'Phần mềm soạn tab',
    description: 'Công cụ soạn tab và luyện tập chuẩn quốc tế, hỗ trợ phát audio track mộc thực tế và loop đoạn khó.',
    price: 'Bản quyền',
    link: 'https://zalo.me/0326768885',
    image: '/assets/gp8.jpg'
  }
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

  gearsGrid.innerHTML = gears.map((gear, idx) => {
    const buyUrl = gear.buy_url || gear.buyUrl || gear.link
    const buyText = gear.buy_text || gear.buyText || 'Xem chi tiết'
    const buyButtonHtml = buyUrl
      ? `<a href="${buyUrl}" target="_blank" rel="noopener noreferrer" class="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-accent-primary/10 hover:bg-warm-gradient hover:text-white text-accent-primary text-xs font-bold transition-all duration-200 group/btn shadow-xs hover:shadow-md">
          <span>${buyText}</span>
          <svg class="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </a>`
      : `<div class="w-full text-center py-1.5 text-xs font-bold text-accent-primary italic truncate">${gear.footer_text || gear.footerText ? `"${(gear.footer_text || gear.footerText).replace(/"/g, '')}"` : ''}</div>`

    const cleanDesc = (gear.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
    const cleanTitle = (gear.title || gear.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
    const imagePath = gear.image ? (gear.image.startsWith('/') ? gear.image : '/' + gear.image) : (gear.image_url || '/assets/clover.jpg')
    const extraClass = idx >= 4 ? 'gear-card-extra hidden' : ''

    return `
      <div class="w-full glass-card card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm hover:shadow-xl hover:border-accent-primary/50 border border-glass-border transition-all duration-300 flex flex-col justify-between group overflow-hidden ${extraClass}">
        <div class="space-y-2.5 sm:space-y-3">
          <!-- Khung ảnh vuông 1:1 -->
          <div class="w-full aspect-square rounded-xl sm:rounded-2xl bg-white/95 dark:bg-white/[0.05] flex items-center justify-center p-3 sm:p-4 border border-glass-border shadow-inner overflow-hidden group/img relative">
            <span class="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 dark:bg-black/80 text-accent-primary backdrop-blur-md text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider shadow-xs z-10">
              ${gear.category || 'PHỤ KIỆN'}
            </span>
            <img src="${imagePath}" alt="${cleanTitle}" class="w-full h-full object-contain filter drop-shadow-xs transition-transform duration-300 group-hover/img:scale-105" onerror="this.src='/assets/clover.jpg'" />
          </div>
          <div class="space-y-1">
            <h4 class="text-xs sm:text-sm font-extrabold text-text-primary group-hover:text-accent-primary transition-colors leading-snug line-clamp-1" title="${cleanTitle}">${cleanTitle}</h4>
            <p class="text-[11px] sm:text-xs text-text-muted font-normal leading-relaxed line-clamp-2" title="${cleanDesc}">${gear.description || ''}</p>
          </div>
        </div>
        <div class="pt-2.5 mt-2.5 border-t border-glass-border/70">
          ${buyButtonHtml}
        </div>
      </div>
    `
  }).join('')

  // Configure Show More Button
  if (showMoreWrap && showMoreBtn && gears.length > 4) {
    showMoreWrap.classList.remove('hidden')
    let isExpanded = false
    const extraCount = gears.length - 4

    showMoreText.textContent = `Xem thêm (${extraCount} món đồ khác)`

    showMoreBtn.onclick = () => {
      isExpanded = !isExpanded
      const extraCards = gearsGrid.querySelectorAll('.gear-card-extra')
      extraCards.forEach(card => {
        if (isExpanded) {
          card.classList.remove('hidden')
          card.classList.add('animate-in', 'fade-in', 'zoom-in-95', 'duration-200')
        } else {
          card.classList.add('hidden')
          card.classList.remove('animate-in', 'fade-in', 'zoom-in-95', 'duration-200')
        }
      })

      if (isExpanded) {
        showMoreText.textContent = 'Thu gọn bớt'
        if (showMoreIcon) showMoreIcon.classList.add('rotate-180')
      } else {
        showMoreText.textContent = `Xem thêm (${extraCount} món đồ khác)`
        if (showMoreIcon) showMoreIcon.classList.remove('rotate-180')
      }
    }
  } else if (showMoreWrap) {
    showMoreWrap.classList.add('hidden')
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderGears()
})
