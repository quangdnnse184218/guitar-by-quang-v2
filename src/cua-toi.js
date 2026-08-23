/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — TAB CỦA TÔI CONTROLLER (cua-toi.js)
 * ==============================================================================
 */

import { initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs } from './lib/songs-service.js'
import {
  getFavoriteIds,
  getCompletedIds,
  isFavorite,
  isCompleted,
  toggleFavorite,
  toggleCompleted
} from './lib/local-storage-service.js'

initNavbarShrink()
initMobileMenu()
initThemeToggle()

// ==========================================================================
// STATE
// ==========================================================================
let allSongs = []
let activeView = 'favorites' // 'favorites' | 'completed'
let activeTypeFilter = 'all' // 'all' | 'free' | 'paid'
let searchQuery = ''

// DOM References
const myTabsContainer = document.getElementById('my-tabs-container')
const viewFavoritesBtn = document.getElementById('view-favorites-btn')
const viewCompletedBtn = document.getElementById('view-completed-btn')
const statFavoritesCount = document.getElementById('stat-favorites-count')
const statCompletedCount = document.getElementById('stat-completed-count')
const badgeFavCount = document.getElementById('badge-fav-count')
const badgeCompCount = document.getElementById('badge-comp-count')
const searchInput = document.getElementById('search-my-tabs')
const typeFilterBtns = document.querySelectorAll('.type-filter-btn')

// Toast Notification
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

// ==========================================================================
// MODAL CONTROLS
// ==========================================================================

function toggleModal(modalId, show = true) {
  const modal = document.getElementById(modalId)
  if (!modal) return
  const dialog = modal.querySelector('.modal-dialog')

  if (show) {
    modal.classList.remove('opacity-0', 'pointer-events-none')
    modal.classList.add('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.remove('scale-95')
      dialog.classList.add('scale-100')
    }
  } else {
    modal.classList.add('opacity-0', 'pointer-events-none')
    modal.classList.remove('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.add('scale-95')
      dialog.classList.remove('scale-100')
    }
    const video = modal.querySelector('video')
    if (video) video.pause()
  }
}

window.openCheckoutModal = function(songId) {
  const song = allSongs.find(s => String(s.id) === String(songId))
  if (!song) return

  const titleEl = document.getElementById('modal-tab-title')
  const metaEl = document.getElementById('modal-tab-meta')
  const priceEl = document.getElementById('modal-tab-price')
  const contentEl = document.getElementById('modal-transfer-content')

  const songTitle = song.title || 'Tab Guitar'
  if (titleEl) titleEl.textContent = songTitle
  if (metaEl) metaEl.textContent = `Tuning: ${song.tuning || 'Standard'} • ${song.category || 'Fingerstyle'}`
  if (priceEl) priceEl.textContent = song.price ? `${song.price.toLocaleString('vi-VN')}đ` : '239.000đ'

  const syntax = `MUA TAB ${songTitle.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, '')}`
  if (contentEl) contentEl.textContent = syntax

  toggleModal('checkout-modal', true)
}

window.openDemoModal = function(songId) {
  const song = allSongs.find(s => String(s.id) === String(songId))
  if (!song) return

  const titleEl = document.getElementById('modal-video-title')
  const videoSource = document.getElementById('demo-video-source')
  const videoPlayer = document.getElementById('demo-video-player')

  if (titleEl) titleEl.textContent = `${song.title || 'Video Demo'} — Tab Fingerstyle`
  if (videoSource && videoPlayer) {
    videoSource.src = song.demo_video_url || song.demoVideoUrl || '/assets/demo.mp4'
    videoPlayer.load()
    videoPlayer.play().catch(() => {})
  }

  toggleModal('video-demo-modal', true)
}

window.handleToggleFavorite = function(e, songId) {
  e.stopPropagation()
  const isNowFav = toggleFavorite(songId)
  showToast(isNowFav ? '❤️ Đã thêm vào Tab Yêu Thích!' : 'Đã bỏ khỏi Tab Yêu Thích!')
  updateBadges()
  renderList()
}

window.handleToggleCompleted = function(e, songId) {
  e.stopPropagation()
  const isNowComp = toggleCompleted(songId)
  showToast(isNowComp ? '✅ Chúc mừng bạn đã tập xong bài này!' : 'Đã bỏ đánh dấu hoàn thành!')
  updateBadges()
  renderList()
}

// ==========================================================================
// RENDERING CARDS
// ==========================================================================

function renderSongCard(tab) {
  const levelNum = tab.level_num ?? tab.levelNum ?? 5
  const isFree = tab.is_free ?? tab.isFree ?? false
  const favActive = isFavorite(tab.id)
  const compActive = isCompleted(tab.id)

  const favBtnHtml = `
    <button onclick="window.handleToggleFavorite(event, '${tab.id}')" class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm ${favActive ? 'bg-rose-500 text-white scale-105' : 'bg-black/40 text-white/80 hover:text-white hover:bg-black/60'}" title="${favActive ? 'Bỏ yêu thích' : 'Yêu thích'}" aria-label="Yêu thích">
      <svg class="w-3.5 h-3.5 ${favActive ? 'fill-current' : 'fill-none'}" stroke="currentColor" stroke-width="${favActive ? '0' : '2'}" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </button>
  `

  const compBtnHtml = `
    <button onclick="window.handleToggleCompleted(event, '${tab.id}')" class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm ${compActive ? 'bg-emerald-500 text-white scale-105' : 'bg-black/40 text-white/80 hover:text-white hover:bg-black/60'}" title="${compActive ? 'Đánh dấu chưa học' : 'Đã học xong'}" aria-label="Đã học xong">
      <svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="${compActive ? '3' : '2.5'}" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </button>
  `

  return `
    <div class="song-card glass-card card-interactive p-4 sm:p-5 flex flex-col justify-between space-y-4 group rounded-3xl border border-glass-border shadow-sm hover:shadow-md transition-all duration-300">
      <div class="space-y-3.5">
        <!-- Thumbnail / Badge -->
        <div class="relative overflow-hidden rounded-2xl aspect-[16/10] bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#020617] p-4 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-300">
          <div class="flex justify-between items-start text-[10px] uppercase font-bold tracking-wider">
            <span class="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full text-white/95">${tab.category || 'Fingerstyle'}</span>
            <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
              ${favBtnHtml}
              ${compBtnHtml}
              <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${isFree ? 'bg-emerald-500 text-white' : 'bg-accent-primary text-white'} shadow-sm">
                ${isFree ? 'FREE' : (tab.price ? `${tab.price.toLocaleString('vi-VN')}đ` : 'Có phí')}
              </span>
            </div>
          </div>

          <div class="my-auto text-center flex flex-col items-center justify-center">
            <h3 class="text-base sm:text-lg font-extrabold tracking-tight drop-shadow-md line-clamp-1">${tab.title}</h3>
            <p class="text-xs text-white/70 font-medium">${tab.singer || 'Guitar By Quang'}</p>
          </div>

          <div class="flex justify-between items-center text-[11px] font-medium text-white/80 border-t border-white/10 pt-2">
            <span>Tuning: ${tab.tuning || 'Standard'}</span>
            <span>Capo: ${tab.capo ?? 0}</span>
          </div>
        </div>

        <!-- Meta Info -->
        <div class="space-y-1.5 px-1">
          <div class="flex justify-between items-center text-xs">
            <span class="text-text-muted font-medium">Độ khó:</span>
            <span class="font-mono font-bold text-accent-primary">${levelNum}/10</span>
          </div>
          <div class="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div class="bg-accent-primary h-1.5 rounded-full" style="width: ${levelNum * 10}%"></div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 pt-2 border-t border-glass-border">
        <button onclick="window.openDemoModal('${tab.id}')" class="flex-1 py-2 px-3 rounded-xl bg-glass-bg hover:bg-glass-bg-hover text-text-primary text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-glass-border cursor-pointer">
          <svg class="w-3.5 h-3.5 text-accent-primary fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          <span>Xem thử</span>
        </button>

        ${isFree ? `
          <a href="${tab.youtube_id ? `https://youtube.com/watch?v=${tab.youtube_id}` : '/kho-tab.html'}" target="_blank" rel="noopener noreferrer" class="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold text-center transition-colors shadow-sm flex items-center justify-center gap-1">
            <span>Học ngay</span>
          </a>
        ` : `
          <button onclick="window.openCheckoutModal('${tab.id}')" class="flex-1 py-2 px-3 rounded-xl bg-warm-gradient hover:brightness-105 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer">
            <span>Nhận Tab</span>
          </button>
        `}
      </div>
    </div>
  `
}

function renderEmptyState(viewType) {
  const isFav = viewType === 'favorites'
  return `
    <div class="col-span-full py-16 px-6 glass-card rounded-3xl border border-glass-border text-center space-y-4 max-w-md mx-auto">
      <div class="w-16 h-16 rounded-full bg-accent-primary/10 text-accent-primary flex items-center justify-center text-3xl mx-auto">
        ${isFav ? '❤️' : '✅'}
      </div>
      <div class="space-y-1.5">
        <h3 class="text-lg font-bold text-text-primary">
          ${isFav ? 'Chưa có bài hát yêu thích nào' : 'Chưa có bài hát nào đã hoàn thành'}
        </h3>
        <p class="text-xs text-text-muted leading-relaxed font-medium">
          ${isFav 
            ? 'Bấm vào biểu tượng trái tim ở bất kỳ video tab nào trong kho để lưu lại luyện tập mỗi ngày nhé!'
            : 'Khi bạn đã tập thuần thục một bài hát, bấm dấu tích xanh để theo dõi tiến độ học đàn của mình!'
          }
        </p>
      </div>
      <a href="/kho-tab.html" class="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-warm-gradient hover:brightness-105 text-white text-xs font-bold transition-all shadow-sm">
        <span>Khám phá Kho Tab</span>
        <span>→</span>
      </a>
    </div>
  `
}

function updateBadges() {
  const favIds = getFavoriteIds()
  const compIds = getCompletedIds()

  if (statFavoritesCount) statFavoritesCount.textContent = `${favIds.length} bài`
  if (statCompletedCount) statCompletedCount.textContent = `${compIds.length} bài`
  if (badgeFavCount) badgeFavCount.textContent = favIds.length
  if (badgeCompCount) badgeCompCount.textContent = compIds.length
}

function renderList() {
  if (!myTabsContainer) return

  const targetIds = activeView === 'favorites' ? getFavoriteIds() : getCompletedIds()
  let filtered = allSongs.filter(song => targetIds.includes(String(song.id)))

  // Filter by Type
  if (activeTypeFilter === 'free') {
    filtered = filtered.filter(song => (song.is_free ?? song.isFree ?? false))
  } else if (activeTypeFilter === 'paid') {
    filtered = filtered.filter(song => !(song.is_free ?? song.isFree ?? false))
  }

  // Filter by Search Query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim()
    filtered = filtered.filter(song => 
      (song.title && song.title.toLowerCase().includes(q)) ||
      (song.singer && song.singer.toLowerCase().includes(q)) ||
      (song.category && song.category.toLowerCase().includes(q))
    )
  }

  if (filtered.length === 0) {
    myTabsContainer.innerHTML = renderEmptyState(activeView)
  } else {
    myTabsContainer.innerHTML = filtered.map(tab => renderSongCard(tab)).join('')
  }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function initMyTabs() {
  allSongs = await fetchAllSongs()
  updateBadges()
  renderList()

  // Tab switcher
  if (viewFavoritesBtn) {
    viewFavoritesBtn.addEventListener('click', () => {
      activeView = 'favorites'
      viewFavoritesBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-warm-gradient text-white shadow-xs flex items-center justify-center gap-2'
      viewCompletedBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-text-muted hover:text-text-primary flex items-center justify-center gap-2'
      renderList()
    })
  }

  if (viewCompletedBtn) {
    viewCompletedBtn.addEventListener('click', () => {
      activeView = 'completed'
      viewCompletedBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer bg-warm-gradient text-white shadow-xs flex items-center justify-center gap-2'
      viewFavoritesBtn.className = 'flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-text-muted hover:text-text-primary flex items-center justify-center gap-2'
      renderList()
    })
  }

  // Type filter buttons
  typeFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeFilterBtns.forEach(b => {
        b.className = 'type-filter-btn px-3 py-1.5 rounded-xl text-text-muted hover:text-text-primary transition-all'
      })
      btn.className = 'type-filter-btn px-3 py-1.5 rounded-xl bg-glass-bg text-accent-primary font-bold shadow-xs transition-all'
      activeTypeFilter = btn.dataset.typeFilter || 'all'
      renderList()
    })
  })

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value
      renderList()
    })
  }

  // Copy Buttons
  const copyStkBtn = document.getElementById('copy-stk-btn')
  if (copyStkBtn) {
    copyStkBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('03970202801')
      showToast('✓ Đã sao chép số tài khoản: 03970202801')
    })
  }

  const copyContentBtn = document.getElementById('copy-content-btn')
  if (copyContentBtn) {
    copyContentBtn.addEventListener('click', () => {
      const contentEl = document.getElementById('modal-transfer-content')
      if (contentEl) {
        navigator.clipboard.writeText(contentEl.textContent.trim())
        showToast('✓ Đã sao chép cú pháp chuyển khoản!')
      }
    })
  }

  // Modal Closers
  const closeCheckoutModal = document.getElementById('close-checkout-modal')
  const closeCheckoutModalBtn = document.getElementById('close-checkout-modal-btn')
  if (closeCheckoutModal) closeCheckoutModal.addEventListener('click', () => toggleModal('checkout-modal', false))
  if (closeCheckoutModalBtn) closeCheckoutModalBtn.addEventListener('click', () => toggleModal('checkout-modal', false))

  const closeVideoModal = document.getElementById('close-video-modal')
  const closeVideoModalBtn = document.getElementById('close-video-modal-btn')
  if (closeVideoModal) closeVideoModal.addEventListener('click', () => toggleModal('video-demo-modal', false))
  if (closeVideoModalBtn) closeVideoModalBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))

  // Close modals on overlay click or Escape
  ;['checkout-modal', 'video-demo-modal'].forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) toggleModal(id, false)
      })
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ;['checkout-modal', 'video-demo-modal'].forEach(id => toggleModal(id, false))
    }
  })
}

document.addEventListener('DOMContentLoaded', initMyTabs)
