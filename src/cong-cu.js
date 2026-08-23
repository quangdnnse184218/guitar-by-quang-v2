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

export function showToast(msg) {
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)
  
  toastMessage.textContent = msg
  toastNotification.classList.remove('opacity-0', '-translate-y-4', 'pointer-events-none')
  toastNotification.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto')
  
  toastTimer = setTimeout(() => {
    toastNotification.classList.add('opacity-0', '-translate-y-4', 'pointer-events-none')
    toastNotification.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto')
  }, 3200)
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

  gearsGrid.innerHTML = gears.map(gear => `
    <div class="flex-1 min-w-[240px] max-w-[280px] p-5 rounded-3xl glass-card border border-glass-border hover:border-accent-primary shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between group">
      <div class="space-y-3.5">
        <div class="w-full aspect-square rounded-2xl bg-black/5 dark:bg-white/5 overflow-hidden flex items-center justify-center p-3 border border-glass-border/50">
          <img src="${gear.image || gear.image_url || '/assets/avatar.jpg'}" alt="${gear.name}" class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" onerror="this.src='/assets/avatar.jpg'" />
        </div>
        <div class="space-y-1">
          <span class="text-[10px] font-mono font-bold uppercase tracking-wider text-accent-primary">${gear.category || 'Gear'}</span>
          <h3 class="text-sm font-bold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-2">${gear.name}</h3>
          <p class="text-xs text-text-muted leading-relaxed font-medium line-clamp-3">${gear.description || ''}</p>
        </div>
      </div>
      <div class="pt-4 mt-4 border-t border-glass-border flex items-center justify-between">
        <span class="text-xs font-mono font-bold text-text-primary">${gear.price || 'Liên hệ'}</span>
        <a href="${gear.link || 'https://zalo.me/0326768885'}" target="_blank" rel="noopener noreferrer" class="px-3 py-1 rounded-full bg-accent-primary/10 hover:bg-accent-primary hover:text-white text-xs font-bold text-accent-primary transition-all">
          Xem chi tiết
        </a>
      </div>
    </div>
  `).join('')
}

document.addEventListener('DOMContentLoaded', () => {
  renderGears()
})
