/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — KHO TAB CONTROLLER
 * ==============================================================================
 * Faithful recreation of the original project layout & features, enhanced
 * with v2's Glassmorphism & Light/Dark Theme System.
 */

import { renderAmbientBlobs, renderMusicNotes, initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs } from './lib/songs-service.js'
import { applyScrollReveal } from './animations/scroll-reveal.js'
import { isFavorite, isCompleted, toggleFavorite, toggleCompleted } from './lib/local-storage-service.js'

// 1. Initialize UI Globals
renderAmbientBlobs()
renderMusicNotes()
initNavbarShrink()
initMobileMenu()
initThemeToggle()

// ==========================================================================
// STATE
// ==========================================================================
let allSongs = []
let currentFilter = 'all' // 'all' | 'paid' | 'free'
let searchQuery = ''
let activeCheckoutSyntax = ''

// DOM Elements
const songsGrid = document.getElementById('songs-grid')
const tabCount = document.getElementById('tab-count')
const emptyState = document.getElementById('songs-empty-state')
const searchInput = document.getElementById('tab-search-input')
const searchClearBtn = document.getElementById('search-clear-btn')
const filterPills = document.querySelectorAll('.filter-pill')
const resetFiltersBtn = document.getElementById('reset-filters-btn')

// Toast Notification
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
let toastTimer = null

/**
 * Remove Vietnamese diacritics for flexible fuzzy searching
 */
export function normalizeVietnameseStr(str) {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim()
}

export function normalizeSpacelessStr(str) {
  return normalizeVietnameseStr(str).replace(/[\s\-_.,/]+/g, '')
}

/**
 * Show a vibrant, prominent toast notification
 */
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

// ==========================================================================
// CARD TEMPLATE RENDERING (Matching the original project)
// ==========================================================================

export function renderSongCard(tab, index) {
  const levelNum = tab.level_num ?? tab.levelNum ?? 5
  const percent = Math.min(100, Math.max(10, (levelNum / 10) * 100))
  const isFree = tab.is_free ?? tab.isFree ?? false
  const favActive = isFavorite(tab.id)
  const compActive = isCompleted(tab.id)

  const favBtnHtml = `
    <button onclick="window.handleToggleFavorite(event, '${tab.id}')" data-fav-btn="${tab.id}" class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm ${favActive ? 'bg-rose-500 text-white scale-105' : 'bg-black/40 text-white/80 hover:text-white hover:bg-black/60'}" title="${favActive ? 'Bỏ yêu thích' : 'Yêu thích'}" aria-label="Yêu thích">
      <svg class="w-3.5 h-3.5 ${favActive ? 'fill-current' : 'fill-none'}" stroke="currentColor" stroke-width="${favActive ? '0' : '2'}" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </button>
  `

  const compBtnHtml = `
    <button onclick="window.handleToggleCompleted(event, '${tab.id}')" data-comp-btn="${tab.id}" class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm ${compActive ? 'bg-emerald-500 text-white scale-105' : 'bg-black/40 text-white/80 hover:text-white hover:bg-black/60'}" title="${compActive ? 'Đánh dấu chưa học' : 'Đã học xong'}" aria-label="Đã học xong">
      <svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="${compActive ? '3' : '2.5'}" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </button>
  `

  const userActionGroup = `
    <div class="flex items-center gap-1.5 z-10" onclick="event.stopPropagation()">
      ${favBtnHtml}
      ${compBtnHtml}
    </div>
  `

  // ========================================================================
  // 1. BIẾN THỂ: CARD BÀI MIỄN PHÍ (FREE)
  // ========================================================================
  if (isFree) {
    return `
      <div onclick="window.openFreeTabModal('${tab.id}')" class="song-card glass-card card-interactive p-4 sm:p-5 flex flex-col justify-between space-y-4 group cursor-pointer" data-id="${tab.id}">
        <div class="space-y-3.5">
          <!-- Visual Banner Header cho Card Free -->
          <div class="relative overflow-hidden rounded-2xl aspect-[16/10] bg-gradient-to-br from-[#1E3A2F] via-[#2A4D3E] to-[#172A22] p-4 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
            <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
              <span class="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full text-white/95">${tab.category || 'Fingerstyle'}</span>
              <div class="flex items-center gap-1.5 flex-wrap justify-end">
                ${userActionGroup}
                <span class="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide">FREE</span>
              </div>
            </div>

            <div class="my-auto text-center flex flex-col items-center justify-center">
              <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-emerald-800 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <span class="text-xs font-bold mt-2 text-white/95 tracking-wide bg-black/45 px-3 py-1 rounded-full backdrop-blur-sm">Xem Tab Miễn Phí</span>
            </div>

            <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
              <span class="font-mono tabular-nums">${tab.duration || 'Full Video'}</span>
              <span class="text-white/80">Tuning: ${tab.tuning || 'Standard'}</span>
            </div>
          </div>

          <!-- Thông tin bài hát -->
          <div class="space-y-2">
            <h3 class="text-lg sm:text-xl font-bold text-text-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-snug">
              ${tab.title}
            </h3>

            <div class="space-y-1.5 pt-0.5">
              <div class="flex items-center justify-between text-xs font-bold text-text-muted">
                <span>Độ khó: <strong class="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">${tab.level || (levelNum + '/10')}</strong></span>
                <span class="text-xs font-semibold text-text-faint">Tuning: ${tab.tuning || 'Standard'}</span>
              </div>
              <div class="w-full bg-glass-bg rounded-full h-1.5 overflow-hidden border border-glass-border">
                <div class="bg-emerald-600 dark:bg-emerald-400 h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
              </div>
            </div>

            <p class="text-xs text-text-muted font-medium leading-relaxed pt-1 line-clamp-2">
              ${tab.description || 'Bản tab guitar fingerstyle miễn phí kèm video hướng dẫn.'}
            </p>
          </div>
        </div>

        <!-- Nút CTA xem miễn phí -->
        <div class="pt-2">
          <div class="w-full py-2.5 rounded-full badge-semantic-success font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95 text-center cursor-pointer">
            <span>Xem Video Tab (Miễn phí)</span>
            <svg class="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </div>
        </div>
      </div>
    `
  }

  // ========================================================================
  // 2. BIẾN THỂ: CARD BÀI TRẢ PHÍ
  // ========================================================================
  const priceFormatted = tab.price_formatted || tab.priceFormatted || '239.000đ'
  const discountNote = tab.discount_note || tab.discountNote || ''
  const hasDemo = tab.has_demo ?? tab.hasDemo ?? false
  const videoDemo = tab.video_demo || tab.videoDemo || ''
  const thumbnailBg = tab.thumbnail_bg || tab.thumbnailBg || 'from-[#C1602F] to-[#6E3B1F]'

  const badgeHtml = `
    <div class="flex flex-col items-end gap-1">
      <span class="px-2.5 py-1 rounded-full text-xs font-black bg-rose-600 text-white shadow-sm uppercase tracking-wide font-mono tabular-nums">BÁN • ${priceFormatted}</span>
      ${discountNote ? `<span class="text-xs text-white bg-accent-primary px-2.5 py-0.5 rounded-full font-extrabold shadow-xs">${discountNote}</span>` : ''}
    </div>
  `

  let artworkCenterHtml = ''
  if (hasDemo && videoDemo) {
    const cleanVideoDemo = videoDemo.startsWith('/') ? videoDemo : '/' + videoDemo
    artworkCenterHtml = `
      <div class="my-auto text-center flex flex-col items-center justify-center" onclick="event.stopPropagation(); window.openVideoDemoModal('${tab.title.replace(/'/g, "\\'")}', '${cleanVideoDemo}')">
        <button class="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-[#0B0E1A] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform cursor-pointer" aria-label="Xem video demo bài hát">
          <svg class="w-5 h-5 fill-current ml-0.5 text-accent-primary" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </button>
        <span class="text-xs font-bold mt-2 text-white/95 tracking-wide bg-black/45 px-3 py-1 rounded-full backdrop-blur-sm">Xem Video Demo</span>
      </div>
    `
  } else {
    artworkCenterHtml = `
      <div class="my-auto text-center flex flex-col items-center justify-center opacity-80">
        <div class="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center text-lg shadow-sm">
          🎸
        </div>
        <span class="text-xs font-bold mt-1.5 text-white/80 tracking-wide">Acoustic Tab</span>
      </div>
    `
  }

  return `
    <div onclick="window.openCheckoutModal('${tab.id}')" class="song-card glass-card card-interactive p-4 sm:p-5 flex flex-col justify-between space-y-4 group cursor-pointer" data-id="${tab.id}">
      <div class="space-y-3.5">
        <div class="relative overflow-hidden rounded-2xl aspect-[16/10] bg-gradient-to-br ${thumbnailBg} p-4 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
          <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
            <span class="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full text-white/95">${tab.category || 'Nhạc Việt'}</span>
            <div class="flex items-start gap-1.5 flex-wrap justify-end">
              ${userActionGroup}
              ${badgeHtml}
            </div>
          </div>

          ${artworkCenterHtml}

          <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
            <span class="font-mono tabular-nums">${tab.duration || 'Full Video'}</span>
            <span class="text-white/80">Tuning: ${tab.tuning || 'Standard'}</span>
          </div>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg sm:text-xl font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-snug">
            ${tab.title}
          </h3>

          <div class="space-y-1.5 pt-0.5">
            <div class="flex items-center justify-between text-xs font-bold text-text-muted">
              <span>Độ khó: <strong class="text-accent-primary font-mono tabular-nums">${tab.level || (levelNum + '/10')}</strong></span>
              <span class="text-xs font-semibold text-text-faint">Tuning: ${tab.tuning || 'Standard'}</span>
            </div>
            <div class="w-full bg-glass-bg rounded-full h-1.5 overflow-hidden border border-glass-border">
              <div class="bg-warm-gradient h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
            </div>
          </div>

          <p class="text-xs text-text-muted font-medium leading-relaxed pt-1 line-clamp-2">
            ${tab.description || 'Bản tab guitar fingerstyle chuẩn âm thanh acoustic.'}
          </p>
        </div>
      </div>

      <div class="pt-2">
        <div class="w-full py-2.5 rounded-full bg-warm-gradient hover:opacity-90 text-white font-bold text-xs transition-all shadow-md shadow-accent-primary/20 flex items-center justify-center gap-1.5 active:scale-95 text-center cursor-pointer">
          <span>Nhận Trọn Bộ Tab & Video</span>
          <svg class="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
          </svg>
        </div>
      </div>
    </div>
  `
}

// ==========================================================================
// FAVORITE & COMPLETED HANDLERS
// ==========================================================================

window.handleToggleFavorite = function handleToggleFavorite(event, songId) {
  if (event) event.stopPropagation()
  const nextState = toggleFavorite(songId)
  const btns = document.querySelectorAll(`[data-fav-btn="${songId}"]`)
  btns.forEach(btn => {
    if (nextState) {
      btn.className = 'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-rose-500 text-white scale-105'
      btn.title = 'Bỏ yêu thích'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    } else {
      btn.className = 'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Yêu thích'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    }
  })
  showToast(nextState ? 'Đã lưu vào danh sách Yêu thích ❤️' : 'Đã bỏ khỏi danh sách Yêu thích')
}

window.handleToggleCompleted = function handleToggleCompleted(event, songId) {
  if (event) event.stopPropagation()
  const nextState = toggleCompleted(songId)
  const btns = document.querySelectorAll(`[data-comp-btn="${songId}"]`)
  btns.forEach(btn => {
    if (nextState) {
      btn.className = 'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-emerald-500 text-white scale-105'
      btn.title = 'Đánh dấu chưa học'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    } else {
      btn.className = 'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Đã học xong'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    }
  })
  showToast(nextState ? 'Đã đánh dấu Đã học xong ✓' : 'Đã bỏ đánh dấu Đã học xong')
}

// ==========================================================================
// MODAL CONTROLLER FUNCTIONS
// ==========================================================================

export function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId)
  if (!modal) return
  const dialog = modal.querySelector('.modal-dialog')

  if (show) {
    modal.classList.remove('hidden')
    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0', 'pointer-events-none')
      modal.classList.add('opacity-100', 'pointer-events-auto')
      if (dialog) {
        dialog.classList.remove('scale-95')
        dialog.classList.add('scale-100')
      }
      document.body.classList.add('modal-open')
    })
  } else {
    // Pause any active videos
    modal.querySelectorAll('video').forEach(v => {
      v.pause()
    })
    const iframe = modal.querySelector('iframe')
    if (iframe) iframe.src = ''

    modal.classList.add('opacity-0', 'pointer-events-none')
    modal.classList.remove('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.add('scale-95')
      dialog.classList.remove('scale-100')
    }
    setTimeout(() => {
      modal.classList.add('hidden')
      document.body.classList.remove('modal-open')
    }, 300)
  }
}

// Quick Video Demo Modal
window.openVideoDemoModal = function openVideoDemoModal(title, videoSrc) {
  if (!title || !videoSrc) return
  const titleEl = document.getElementById('video-demo-title')
  const videoEl = document.getElementById('demo-modal-video')
  if (titleEl) titleEl.textContent = title
  if (videoEl) {
    videoEl.src = videoSrc
    videoEl.load()
    videoEl.play().catch(() => {})
  }
  toggleModal('video-demo-modal', true)
}

// Image Zoom Modal (for QR)
window.openImageModal = function openImageModal(src, title, caption) {
  const imgEl = document.getElementById('image-modal-img')
  const titleEl = document.getElementById('image-modal-title')
  const captionEl = document.getElementById('image-modal-caption')
  if (imgEl && src) imgEl.src = src
  if (titleEl && title) titleEl.textContent = title
  if (captionEl && caption) captionEl.textContent = caption
  toggleModal('image-preview-modal', true)
}

// Checkout Modal (Paid)
window.openCheckoutModal = function openCheckoutModal(tabId) {
  if (!allSongs || !allSongs.length) return
  const tab = allSongs.find(t => t.id === tabId)
  if (!tab) return

  const titleEl = document.getElementById('modal-tab-title')
  const metaEl = document.getElementById('modal-tab-meta')
  const priceEl = document.getElementById('modal-tab-price')
  const syntaxEl = document.getElementById('modal-transfer-syntax')
  const discountTag = document.getElementById('modal-discount-tag')
  const levelEl = document.getElementById('modal-tab-level')
  const tuningEl = document.getElementById('modal-tab-tuning')
  const capoEl = document.getElementById('modal-tab-capo')
  const tempoEl = document.getElementById('modal-tab-tempo')
  const durationEl = document.getElementById('modal-tab-duration')
  const videoEl = document.getElementById('checkout-modal-video')
  const videoSrcEl = document.getElementById('checkout-modal-video-source')
  const videoContainer = document.getElementById('checkout-modal-video-container')

  if (titleEl) titleEl.textContent = tab.title
  if (metaEl) metaEl.textContent = `Tuning: ${tab.tuning || 'Standard'} • Bản Video Tab chạy nốt đồng bộ với âm thanh đàn mộc thật và nhịp gõ`
  if (priceEl) priceEl.textContent = tab.price_formatted || tab.priceFormatted || '239.000 VNĐ'

  if (levelEl) levelEl.textContent = tab.level || `${tab.level_num ?? tab.levelNum ?? 5}/10`
  if (tuningEl) tuningEl.textContent = tab.tuning || 'Standard'
  if (capoEl) capoEl.textContent = tab.capo || 'Không kẹp'
  if (tempoEl) tempoEl.textContent = tab.tempo || '~95 BPM'
  if (durationEl) durationEl.textContent = tab.duration || '03:30'

  const discountNote = tab.discount_note || tab.discountNote || ''
  if (discountTag) {
    if (discountNote) {
      discountTag.textContent = `(${discountNote})`
      discountTag.classList.remove('hidden')
    } else {
      discountTag.classList.add('hidden')
    }
  }

  // Syntax calculation
  const cleanSongCode = tab.title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
  activeCheckoutSyntax = `VIDEOTAB ${cleanSongCode}`
  if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax

  // Video Demo Section
  const hasDemo = tab.has_demo ?? tab.hasDemo ?? false
  const videoDemo = tab.video_demo || tab.videoDemo || ''
  if (videoEl && videoSrcEl && videoContainer) {
    if (hasDemo && videoDemo) {
      const cleanVideo = videoDemo.startsWith('/') ? videoDemo : '/' + videoDemo
      videoSrcEl.src = cleanVideo
      videoEl.load()
      videoContainer.classList.remove('hidden')
    } else {
      videoContainer.classList.add('hidden')
    }
  }

  toggleModal('checkout-modal', true)
}

// Free Tab Modal
window.openFreeTabModal = function openFreeTabModal(tabId) {
  if (!allSongs || !allSongs.length) return
  const tab = allSongs.find(t => t.id === tabId)
  if (!tab) return

  const titleEl = document.getElementById('free-tab-modal-title')
  const levelEl = document.getElementById('free-tab-modal-level')
  const tuningEl = document.getElementById('free-tab-modal-tuning')
  const durationEl = document.getElementById('free-tab-modal-duration')
  const capoEl = document.getElementById('free-tab-modal-capo')
  const tempoEl = document.getElementById('free-tab-modal-tempo')
  const techContainer = document.getElementById('free-tab-modal-techniques')
  const iframeEl = document.getElementById('free-tab-iframe')
  const localVideoEl = document.getElementById('free-tab-local-video')
  const backupLinkEl = document.getElementById('free-tab-backup-link')
  const pdfBtn = document.getElementById('free-tab-pdf-btn')

  if (titleEl) titleEl.textContent = tab.title
  if (levelEl) levelEl.textContent = tab.level || `${tab.level_num ?? tab.levelNum ?? 5}/10`
  if (tuningEl) tuningEl.textContent = tab.tuning || 'Standard'
  if (durationEl) durationEl.textContent = tab.duration || '03:15'
  if (capoEl) capoEl.textContent = tab.capo || 'Không kẹp'
  if (tempoEl) tempoEl.textContent = tab.tempo || '~95 BPM'

  // Techniques Detection
  if (techContainer) {
    let techs = ['Tỉa ngón', 'Slap', 'Nail Attack']
    if (tab.description) {
      const descLower = tab.description.toLowerCase()
      const detected = []
      if (descLower.includes('slap')) detected.push('Slap')
      if (descLower.includes('nail attack')) detected.push('Nail Attack')
      if (descLower.includes('hammer') || descLower.includes('pull')) detected.push('Hammer-on / Pull-off')
      if (descLower.includes('slide') || descLower.includes('vuốt')) detected.push('Slide (Vuốt dây)')
      if (descLower.includes('rải') || descLower.includes('tỉa')) detected.push('Tỉa ngón / Rải')
      if (descLower.includes('bass')) detected.push('Đi Bass')
      if (detected.length > 0) techs = detected
    }
    techContainer.innerHTML = techs.map(t => `<span class="px-2.5 py-1 rounded-lg modal-inner-card text-text-primary text-[11px] font-semibold shadow-xs">${t}</span>`).join('')
  }

  // Video embed url: parse Youtube nếu có hoặc dùng local video
  const videoUrl = tab.target_url || tab.targetUrl || tab.video_demo || tab.videoDemo || ''
  let isYouTube = false
  let embedUrl = videoUrl

  if (videoUrl.includes('youtube.com/watch?v=')) {
    const videoId = videoUrl.split('watch?v=')[1]?.split('&')[0]
    embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`
    isYouTube = true
  } else if (videoUrl.includes('youtu.be/')) {
    const videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0]
    embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`
    isYouTube = true
  }

  if (isYouTube && iframeEl) {
    iframeEl.src = embedUrl
    iframeEl.classList.remove('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
  } else if (tab.has_demo && tab.video_demo && localVideoEl) {
    const cleanVideo = tab.video_demo.startsWith('/') ? tab.video_demo : '/' + tab.video_demo
    localVideoEl.src = cleanVideo
    localVideoEl.classList.remove('hidden')
    if (iframeEl) iframeEl.classList.add('hidden')
  } else if (iframeEl) {
    iframeEl.src = ''
    iframeEl.classList.add('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
  }

  if (backupLinkEl) {
    backupLinkEl.href = videoUrl || '#'
  }

  if (pdfBtn) {
    const pdfUrl = tab.pdf_url || tab.pdfUrl
    if (pdfUrl) {
      pdfBtn.removeAttribute('disabled')
      pdfBtn.href = pdfUrl
      pdfBtn.target = '_blank'
      pdfBtn.className = 'w-full py-3 rounded-full bg-accent-primary hover:brightness-105 text-white dark:text-[#0B0E1A] font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 text-center cursor-pointer'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 fill-none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Tải file PDF Tab</span>
      `
    } else {
      pdfBtn.setAttribute('disabled', 'true')
      pdfBtn.removeAttribute('href')
      pdfBtn.className = 'w-full py-3 rounded-full modal-inner-card text-text-muted font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 text-center cursor-not-allowed opacity-60'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Tải file PDF (Đang cập nhật)</span>
      `
    }
  }

  toggleModal('free-tab-modal', true)
}

// ==========================================================================
// RENDER TABS GRID
// ==========================================================================

function renderTabs() {
  if (!songsGrid) return

  const searchRaw = searchQuery.trim()
  const searchNormalized = normalizeVietnameseStr(searchRaw)
  const searchSpaceless = normalizeSpacelessStr(searchRaw)

  const filtered = allSongs.filter(tab => {
    let matchFilter = true
    const isFree = tab.is_free ?? tab.isFree ?? false
    if (currentFilter === 'paid') {
      matchFilter = isFree === false
    } else if (currentFilter === 'free') {
      matchFilter = isFree === true
    }
    if (!matchFilter) return false
    if (!searchRaw) return true

    const titleNorm = normalizeVietnameseStr(tab.title || '')
    const titleSpaceless = normalizeSpacelessStr(tab.title || '')
    const descNorm = normalizeVietnameseStr(tab.description || '')
    const artistNorm = normalizeVietnameseStr(tab.artist || '')

    const matchTitle = titleNorm.includes(searchNormalized) || titleSpaceless.includes(searchSpaceless)
    const matchDesc = descNorm.includes(searchNormalized) || artistNorm.includes(searchNormalized)
    return matchTitle || matchDesc
  })

  if (tabCount) tabCount.textContent = filtered.length

  if (filtered.length === 0) {
    songsGrid.innerHTML = ''
    songsGrid.classList.add('hidden')
    if (emptyState) {
      emptyState.classList.remove('hidden')
      const emptyMsg = document.getElementById('empty-state-message')
      if (emptyMsg) {
        emptyMsg.textContent = searchRaw 
          ? `Không tìm thấy bài nào khớp với từ khóa "${searchRaw}". Anh em cần bài gì cứ nhắn thẳng qua Zalo để mình xếp lịch soạn nhé!`
          : 'Anh em cần bài gì cứ nhắn thẳng qua Zalo để mình xếp lịch soạn nhé!'
      }
    }
    return
  }

  songsGrid.classList.remove('hidden')
  if (emptyState) emptyState.classList.add('hidden')

  songsGrid.innerHTML = filtered.map((tab, index) => renderSongCard(tab, index)).join('')

  applyScrollReveal('.song-card')
}

// ==========================================================================
// EVENT LISTENERS INITIALIZATION
// ==========================================================================

function setupEventListeners() {
  // Filter pills
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      currentFilter = pill.getAttribute('data-filter') || 'all'
      renderTabs()
    })
  })

  // Search Input with Debounce
  let debounceTimeout = null
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimeout)
      const val = e.target.value
      if (searchClearBtn) searchClearBtn.classList.toggle('hidden', val.length === 0)

      debounceTimeout = setTimeout(() => {
        searchQuery = val
        renderTabs()
      }, 150)
    })
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = ''
        searchClearBtn.classList.add('hidden')
      }
      searchQuery = ''
      renderTabs()
    })
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = ''
        if (searchClearBtn) searchClearBtn.classList.add('hidden')
      }
      searchQuery = ''
      currentFilter = 'all'
      filterPills.forEach(p => {
        if (p.getAttribute('data-filter') === 'all') p.classList.add('active')
        else p.classList.remove('active')
      })
      renderTabs()
    })
  }

  // Modal Closers
  const closeCheckoutBtn = document.getElementById('close-checkout-modal')
  if (closeCheckoutBtn) closeCheckoutBtn.addEventListener('click', () => toggleModal('checkout-modal', false))

  const closeFreeBtn = document.getElementById('close-free-tab-modal')
  if (closeFreeBtn) closeFreeBtn.addEventListener('click', () => toggleModal('free-tab-modal', false))

  const closeVideoDemoBtn = document.getElementById('close-video-demo-modal')
  if (closeVideoDemoBtn) closeVideoDemoBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))

  const closeImageModalBtn = document.getElementById('close-image-modal')
  if (closeImageModalBtn) closeImageModalBtn.addEventListener('click', () => toggleModal('image-preview-modal', false))

  // QR Trigger in modal
  const qrTrigger = document.getElementById('qr-preview-trigger')
  if (qrTrigger) {
    qrTrigger.addEventListener('click', () => {
      window.openImageModal('/assets/qr.jpg', 'Mã QR Chuyển Khoản TpBank (03970202801)', 'Quét mã QR bằng App Ngân hàng bất kỳ để nhận bản Video Tab và hỗ trợ 1-1 qua Zalo.')
    })
  }

  // Copy Buttons
  const copyStkBtn = document.getElementById('copy-stk-btn')
  if (copyStkBtn) {
    copyStkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('03970202801')
        showToast('Đã sao chép số tài khoản TpBank: 03970202801 📋')
      } catch (e) {
        showToast('Không thể sao chép tự động.')
      }
    })
  }

  const copySyntaxBtn = document.getElementById('copy-syntax-btn')
  if (copySyntaxBtn) {
    copySyntaxBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(activeCheckoutSyntax || 'VIDEOTAB TAB')
        showToast(`Đã sao chép cú pháp: ${activeCheckoutSyntax} 📋`)
      } catch (e) {
        showToast('Không thể sao chép tự động.')
      }
    })
  }

  // Share Buttons
  const shareZaloBtn = document.getElementById('share-zalo-btn')
  if (shareZaloBtn) {
    shareZaloBtn.addEventListener('click', () => {
      const url = encodeURIComponent(window.location.href)
      window.open(`https://sp.zalo.me/share_inline?link=${url}`, '_blank')
    })
  }

  const shareFbBtn = document.getElementById('share-fb-btn')
  if (shareFbBtn) {
    shareFbBtn.addEventListener('click', () => {
      const url = encodeURIComponent(window.location.href)
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
    })
  }

  // Click outside to close modals
  const modals = ['checkout-modal', 'free-tab-modal', 'video-demo-modal', 'image-preview-modal']
  modals.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) toggleModal(id, false)
      })
    }
  })

  // Escape key closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modals.forEach(id => toggleModal(id, false))
    }
  })
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function initKhoTab() {
  setupEventListeners()

  allSongs = await fetchAllSongs()

  if (!allSongs || allSongs.length === 0) {
    if (tabCount) tabCount.textContent = '0'
    if (songsGrid) {
      songsGrid.innerHTML = `
        <div class="col-span-full w-full py-14 text-center text-text-muted text-sm font-medium space-y-3 glass-card p-8 rounded-3xl">
          <div class="text-4xl">🎸</div>
          <p class="text-base font-bold text-text-primary">Kho Video Tab đang bị gián đoạn kết nối, anh em thử tải lại trang giúp mình nhé!</p>
          <p class="text-xs">Nếu vẫn không được, nhắn mình qua Zalo 0326.768.885 để mình gửi tab trực tiếp nhé.</p>
          <button onclick="location.reload()" class="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-accent-primary text-[#0B0E1A] text-xs font-bold shadow-md hover:brightness-105 transition-all cursor-pointer">
            Tải lại trang
          </button>
        </div>
      `
    }
    return
  }

  renderTabs()
}

initKhoTab()
