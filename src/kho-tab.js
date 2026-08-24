import { renderAmbientBlobs, renderMusicNotes, initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs, extractYoutubeId, normalizeVideoPath } from './lib/songs-service.js'
import { applyScrollReveal } from './animations/scroll-reveal.js'
import { isFavorite, isCompleted, toggleFavorite, toggleCompleted } from './lib/local-storage-service.js'
import { supabase } from './lib/supabase.js'

// Initialize UI
renderAmbientBlobs()
renderMusicNotes()
initNavbarShrink()
initMobileMenu()
initThemeToggle()

// ==========================================================================
// STATE
// ==========================================================================
let allSongs = []
let activeFilter = 'all' // all, free, paid
let searchQuery = ''
let activeCheckoutSyntax = ''

// Toast Notification
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
let toastTimer = null

window.showToast = function showToast(msg, type = 'success') {
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)
  
  const toastIcon = document.getElementById('toast-icon')
  
  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg

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

// ==========================================================================
// RENDER CARD (Copied from main.js)
// ==========================================================================
export function formatCompactPrice(val) {
  if (val === 0 || val === '0') return 'Miễn phí'
  if (!val && val !== 0) return '239k'
  const str = String(val).trim()
  if (!str || str.toLowerCase() === 'miễn phí' || str.toLowerCase() === 'free') return 'Miễn phí'
  if (str.toLowerCase().endsWith('k')) return str.toLowerCase()
  const numericOnly = Number(str.replace(/[^0-9]/g, ''))
  if (numericOnly >= 1000) {
    return `${Math.round(numericOnly / 1000)}k`
  }
  if (numericOnly > 0) {
    return `${numericOnly}k`
  }
  return str
}

export function formatCompactDiscount(note) {
  if (!note) return 'HSSV: 179k'
  const str = String(note).trim()
  if (str.toLowerCase().includes('179')) return 'HSSV: 179k'
  if (str.length > 15) {
    const num = str.replace(/[^0-9]/g, '')
    if (num) return `HSSV: ${num.length >= 4 ? Math.round(Number(num)/1000) : num}k`
  }
  return str
}

function renderSongCard(tab, index, extraClass = '') {
  const levelNum = tab.level_num ?? tab.levelNum ?? 5
  const percent = Math.min(100, Math.max(10, (levelNum / 10) * 100))
  const isFree = tab.is_free ?? tab.isFree ?? false

  if (isFree) {
    return `
      <div onclick="window.openFreeTabModal('${tab.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-glass-border flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer ${extraClass}" data-id="${tab.id}">
        <div class="space-y-2 sm:space-y-3">
          <div class="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-br from-[#1E3A2F] via-[#2A4D3E] to-[#172A22] p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
            <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
              <span class="bg-black/50 backdrop-blur px-1.5 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] font-mono">${tab.category || 'Fingerstyle'}</span>
              <div class="flex items-center gap-1 flex-wrap justify-end">
                <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide">FREE</span>
              </div>
            </div>

            <div class="my-auto text-center flex flex-col items-center justify-center py-0.5">
              <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white text-emerald-800 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <svg class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 fill-current ml-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <span class="text-[8px] sm:text-[10px] font-bold mt-1 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap">Xem Tab Miễn Phí</span>
            </div>

            <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
              <span class="font-mono tabular-nums text-[9px] sm:text-[11px]">${tab.duration || 'Full Video'}</span>
              <span class="text-white/80 text-[8px] sm:text-[11px]">Tuning: ${tab.tuning || 'Standard'}</span>
            </div>
          </div>

          <div class="space-y-1">
            <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-tight line-clamp-1">
              ${tab.title}
            </h3>

            <div class="space-y-0.5 sm:space-y-1 pt-0.5">
              <div class="flex items-center justify-between text-[10px] sm:text-xs font-bold text-text-muted">
                <span>Độ khó: <strong class="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">${tab.level || (levelNum + '/10')}</strong></span>
                <span class="text-[9px] sm:text-xs font-semibold text-text-faint hidden sm:inline">Tuning: ${tab.tuning || 'Standard'}</span>
              </div>
              <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
                <div class="bg-emerald-600 dark:bg-emerald-400 h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
              </div>
            </div>

            <p class="text-[10px] sm:text-xs text-text-muted font-medium leading-snug pt-0.5 line-clamp-2">
              ${tab.description || 'Bản tab guitar fingerstyle miễn phí kèm video hướng dẫn.'}
            </p>
          </div>
        </div>

        <div class="pt-1 sm:pt-2">
          <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full badge-semantic-success font-bold text-[10px] sm:text-xs transition-all shadow-sm flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
            <span class="truncate">Xem Video Tab (Free)</span>
          </div>
        </div>
      </div>
    `
  }

  // 2. PAID CARD
  const rawPrice = tab.price_formatted || tab.priceFormatted || tab.price || '239k'
  const priceFormatted = formatCompactPrice(rawPrice)
  const discountNote = formatCompactDiscount(tab.discount_note || tab.discountNote)
  const hasDemo = tab.has_demo ?? tab.hasDemo ?? false
  const videoDemo = tab.video_demo || tab.videoDemo || ''
  const thumbnailBg = tab.thumbnail_bg || tab.thumbnailBg || 'from-[#C1602F] to-[#6E3B1F]'

  const badgeHtml = `
    <div class="flex flex-col items-end gap-0.5 sm:gap-1">
      <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9.5px] font-black bg-rose-600 text-white shadow-sm uppercase tracking-wide font-mono tabular-nums">BÁN • ${priceFormatted}</span>
      ${discountNote ? `<span class="text-[7px] sm:text-[8.5px] text-white bg-accent-primary px-1.5 py-0.5 rounded-full font-extrabold shadow-xs inline-block leading-none whitespace-nowrap">${discountNote}</span>` : ''}
    </div>
  `

  const isAudioOnly = Boolean(tab.is_audio_only ?? tab.isAudioOnly)
  let artworkCenterHtml = ''
  const demoUrl = videoDemo || tab.demo_video_url || tab.youtube_id || ''
  if (hasDemo && demoUrl) {
    const playText = isAudioOnly ? 'Nghe Audio Demo' : 'Xem Video Demo'
    artworkCenterHtml = `
      <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.openVideoDemoModal('${tab.title.replace(/'/g, "\\'")}', '${demoUrl.replace(/\\/g, '/').replace(/'/g, "\\'")}', ${isAudioOnly})">
        <button class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white text-[#0B0E1A] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform cursor-pointer" aria-label="${playText}">
          ${isAudioOnly ? '<span class="text-sm sm:text-base">🎧</span>' : '<svg class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 fill-current ml-0.5 text-accent-primary" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}
        </button>
        <span class="text-[8px] sm:text-[10px] font-bold mt-1 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap">${playText}</span>
      </div>
    `
  } else {
    artworkCenterHtml = `
      <div class="my-auto text-center flex flex-col items-center justify-center opacity-80 py-0.5">
        <div class="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-black/30 flex items-center justify-center text-xs sm:text-sm shadow-sm">
          🎸
        </div>
        <span class="text-[8px] sm:text-[10px] font-bold mt-0.5 text-white/80 tracking-wide">Acoustic Tab</span>
      </div>
    `
  }

  return `
    <div onclick="window.openCheckoutModal('${tab.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-glass-border flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer ${extraClass}" data-id="${tab.id}">
      <div class="space-y-2 sm:space-y-3">
        <div class="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-br ${thumbnailBg} p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
          <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
            <span class="bg-black/50 backdrop-blur px-1.5 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] font-mono">${tab.category || 'Nhạc Việt'}</span>
            <div class="flex items-start gap-1 flex-wrap justify-end">
              ${badgeHtml}
            </div>
          </div>

          ${artworkCenterHtml}

          <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
            <span class="font-mono tabular-nums text-[9px] sm:text-[11px]">${tab.duration || 'Full Video'}</span>
            <span class="text-white/80 text-[8px] sm:text-[11px]">Tuning: ${tab.tuning || 'Standard'}</span>
          </div>
        </div>

        <div class="space-y-1">
          <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-tight line-clamp-1">
            ${tab.title}
          </h3>

          <div class="space-y-0.5 sm:space-y-1 pt-0.5">
            <div class="flex items-center justify-between text-[10px] sm:text-xs font-bold text-text-muted">
              <span>Độ khó: <strong class="text-accent-primary font-mono tabular-nums">${tab.level || (levelNum + '/10')}</strong></span>
              <span class="text-[9px] sm:text-xs font-semibold text-text-faint hidden sm:inline">Tuning: ${tab.tuning || 'Standard'}</span>
            </div>
            <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
              <div class="bg-warm-gradient h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
            </div>
          </div>

          <p class="text-[10px] sm:text-xs text-text-muted font-medium leading-snug pt-0.5 line-clamp-2">
            ${tab.description || 'Bản tab guitar fingerstyle chuẩn âm thanh acoustic.'}
          </p>
        </div>
      </div>

      <div class="pt-1 sm:pt-2">
        <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-warm-gradient hover:opacity-90 text-white font-bold text-[10px] sm:text-xs transition-all shadow-md shadow-accent-primary/20 flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
          <span class="truncate">Nhận Video Tab</span>
        </div>
      </div>
    </div>
  `
}

// ==========================================================================
// RENDER & FILTER LIST
// ==========================================================================
function removeAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function updateGrid() {
  const grid = document.getElementById('songs-grid')
  if (!grid) return

  let filtered = allSongs

  // Lọc theo tag
  if (activeFilter === 'free') {
    filtered = filtered.filter(s => s.is_free || s.isFree)
  } else if (activeFilter === 'paid') {
    filtered = filtered.filter(s => !s.is_free && !s.isFree)
  }

  // Lọc theo search
  if (searchQuery) {
    const q = removeAccents(searchQuery)
    filtered = filtered.filter(s => {
      const titleMatch = removeAccents(s.title || '').includes(q)
      const singerMatch = removeAccents(s.singer || '').includes(q)
      return titleMatch || singerMatch
    })
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-20">
      <span class="text-4xl block mb-4">🎵</span>
      <p class="text-text-muted font-medium">Không tìm thấy bài hát nào phù hợp.</p>
    </div>`
    return
  }

  const html = filtered.map((song, i) => renderSongCard(song, i)).join('')
  grid.innerHTML = html

  setTimeout(() => {
    applyScrollReveal('.song-card')
  }, 50)
}

function initSearchAndFilter() {
  const searchInput = document.getElementById('search-input')
  const filterPills = document.querySelectorAll('#filter-pills .filter-pill')

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value
      updateGrid()
    })
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('active', 'text-text-primary')
        p.classList.add('text-text-muted')
      })
      pill.classList.add('active', 'text-text-primary')
      pill.classList.remove('text-text-muted')
      
      activeFilter = pill.getAttribute('data-filter') || 'all'
      updateGrid()
    })
  })
}

// ==========================================================================
// LOAD DATA
// ==========================================================================
async function loadData() {
  allSongs = await fetchAllSongs()
  updateGrid()
}

// ==========================================================================
// FAVORITE & COMPLETED HANDLERS (Copied from main.js)
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

  // Sync with Supabase favorites if logged in
  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        if (nextState) {
          await supabase.from('favorites').upsert({ user_id: session.user.id, song_id: String(songId) })
        } else {
          await supabase.from('favorites').delete().match({ user_id: session.user.id, song_id: String(songId) })
        }
      }
    } catch (err) {
      console.warn('Sync favorite error:', err)
    }
  })()
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
// MODALS LOGIC
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
    modal.querySelectorAll('video').forEach(v => v.pause())
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

window.toggleModal = toggleModal

window.openVideoDemoModal = function openVideoDemoModal(title, videoSrc, isAudioOnly = false) {
  if (!title || !videoSrc) return
  const titleEl = document.getElementById('video-demo-title')
  const videoEl = document.getElementById('demo-modal-video')
  const iframeEl = document.getElementById('demo-modal-iframe')
  const audioCoverEl = document.getElementById('demo-modal-audio-cover')

  if (titleEl) titleEl.textContent = title

  if (audioCoverEl) {
    if (isAudioOnly) {
      audioCoverEl.classList.remove('hidden')
    } else {
      audioCoverEl.classList.add('hidden')
    }
  }

  const ytId = extractYoutubeId(videoSrc)

  if (ytId && iframeEl) {
    iframeEl.src = `https://www.youtube.com/embed/${ytId}?autoplay=1`
    iframeEl.classList.remove('hidden')
    if (videoEl) {
      videoEl.pause?.()
      videoEl.src = ''
      videoEl.classList.add('hidden')
    }
  } else if (videoEl) {
    if (iframeEl) {
      iframeEl.src = ''
      iframeEl.classList.add('hidden')
    }
    const cleanSrc = normalizeVideoPath(videoSrc)
    const encodedSrc = cleanSrc.startsWith('http') ? cleanSrc : encodeURI(cleanSrc)
    videoEl.src = encodedSrc
    const sourceEl = videoEl.querySelector('source')
    if (sourceEl) sourceEl.src = encodedSrc
    videoEl.classList.remove('hidden')
    videoEl.load()
    videoEl.play().catch(() => {})
  }

  toggleModal('video-demo-modal', true)
}

window.openImageModal = function openImageModal(src, title, caption) {
  const imgEl = document.getElementById('image-modal-img')
  const titleEl = document.getElementById('image-modal-title')
  const captionEl = document.getElementById('image-modal-caption')
  if (imgEl && src) imgEl.src = src
  if (titleEl && title) titleEl.textContent = title
  if (captionEl && caption) captionEl.textContent = caption
  toggleModal('image-preview-modal', true)
}

window.openCheckoutModal = async function openCheckoutModal(tabId) {
  if (!allSongs || !allSongs.length) return
  const tab = allSongs.find(t => t.id === tabId)
  if (!tab) return

  // Gate Check for paid cards: MUST BE LOGGED IN
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) {
      const loginBtn = document.getElementById('auth-required-login-btn')
      if (loginBtn) {
        loginBtn.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      }
      toggleModal('auth-required-modal', true)
      return
    }
  } catch (e) {
    console.warn('Auth check error in openCheckoutModal:', e)
  }

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

  const cleanSongCode = tab.title.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
  activeCheckoutSyntax = `VIDEOTAB ${cleanSongCode}`
  if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax

  const hasDemo = tab.has_demo ?? tab.hasDemo ?? false
  const videoDemo = tab.demo_video_url || tab.video_demo || tab.videoDemo || tab.youtube_id || ''
  if (videoEl && videoContainer) {
    if (hasDemo && videoDemo) {
      const cleanVideo = normalizeVideoPath(videoDemo)
      const encodedVideo = cleanVideo.startsWith('http') ? cleanVideo : encodeURI(cleanVideo)
      videoEl.src = encodedVideo
      if (videoSrcEl) videoSrcEl.src = encodedVideo
      videoEl.load()
      videoContainer.classList.remove('hidden')
    } else {
      videoContainer.classList.add('hidden')
    }
  }

  toggleModal('checkout-modal', true)
}

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

  // Techniques mapping
  const knownTech = [
    { key: 'slap', label: 'Slap (Gõ thùng)' },
    { key: 'slide', label: 'Slide (Vuốt)' },
    { key: 'hammer', label: 'Hammer-on' },
    { key: 'pull', label: 'Pull-off' },
    { key: 'harmonic', label: 'Harmonic' }
  ]
  if (techContainer) {
    const desc = (tab.description || '').toLowerCase()
    let html = ''
    let found = false
    knownTech.forEach(tc => {
      if (desc.includes(tc.key)) {
        html += `<span class="px-2.5 py-1 rounded-lg modal-inner-card text-text-primary text-[11px] font-semibold shadow-xs">${tc.label}</span>`
        found = true
      }
    })
    if (!found) {
      html += `<span class="px-2.5 py-1 rounded-lg modal-inner-card text-text-primary text-[11px] font-semibold shadow-xs">Fingerstyle Cơ bản</span>`
    }
    techContainer.innerHTML = html
  }

  const targetUrl = tab.target_url || tab.targetUrl || tab.tab_url || tab.tabUrl
  if (targetUrl) {
    if (backupLinkEl) {
      backupLinkEl.href = targetUrl
      backupLinkEl.classList.remove('hidden')
    }
    const isYt = targetUrl.includes('youtu')
    const isTiktok = targetUrl.includes('tiktok.com')

    if (iframeEl && localVideoEl) {
      if (isYt) {
        let videoId = ''
        if (targetUrl.includes('youtu.be/')) videoId = targetUrl.split('youtu.be/')[1].split('?')[0]
        else if (targetUrl.includes('v=')) videoId = targetUrl.split('v=')[1].split('&')[0]
        
        iframeEl.src = `https://www.youtube.com/embed/${videoId}`
        iframeEl.classList.remove('hidden')
        localVideoEl.classList.add('hidden')
      } else if (isTiktok) {
        const parts = targetUrl.split('/')
        const videoId = parts[parts.length - 1].split('?')[0]
        iframeEl.src = `https://www.tiktok.com/embed/v2/${videoId}`
        iframeEl.classList.remove('hidden')
        localVideoEl.classList.add('hidden')
      } else if (targetUrl.endsWith('.mp4')) {
        iframeEl.src = ''
        iframeEl.classList.add('hidden')
        const cleanUrl = targetUrl.startsWith('/') ? targetUrl : '/' + targetUrl
        localVideoEl.src = cleanUrl
        localVideoEl.classList.remove('hidden')
      } else {
        iframeEl.src = targetUrl
        iframeEl.classList.remove('hidden')
        localVideoEl.classList.add('hidden')
      }
    }
  } else {
    if (iframeEl) iframeEl.classList.add('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
    if (backupLinkEl) backupLinkEl.classList.add('hidden')
  }

  if (pdfBtn) {
    if (tab.pdf_url || tab.pdfUrl) {
      pdfBtn.href = tab.pdf_url || tab.pdfUrl
      pdfBtn.classList.remove('hidden')
    } else {
      pdfBtn.classList.add('hidden')
    }
  }

  toggleModal('free-tab-modal', true)
}

function initModalInteractions() {
  const closeCheckoutBtn = document.getElementById('close-checkout-modal')
  const closeFreeBtn = document.getElementById('close-free-tab-modal')
  const closeVideoDemoBtn = document.getElementById('close-video-demo-modal')
  const closeImageBtn = document.getElementById('close-image-modal')
  const closeAuthReqBtn = document.getElementById('close-auth-required-modal')
  const checkoutModal = document.getElementById('checkout-modal')
  const freeTabModal = document.getElementById('free-tab-modal')
  const videoDemoModal = document.getElementById('video-demo-modal')
  const imageModal = document.getElementById('image-preview-modal')
  const authReqModal = document.getElementById('auth-required-modal')

  if (closeCheckoutBtn) closeCheckoutBtn.addEventListener('click', () => toggleModal('checkout-modal', false))
  if (closeFreeBtn) closeFreeBtn.addEventListener('click', () => toggleModal('free-tab-modal', false))
  if (closeVideoDemoBtn) closeVideoDemoBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))
  if (closeImageBtn) closeImageBtn.addEventListener('click', () => toggleModal('image-preview-modal', false))
  if (closeAuthReqBtn) closeAuthReqBtn.addEventListener('click', () => toggleModal('auth-required-modal', false))

  window.addEventListener('click', (e) => {
    if (e.target === checkoutModal) toggleModal('checkout-modal', false)
    if (e.target === freeTabModal) toggleModal('free-tab-modal', false)
    if (e.target === videoDemoModal) toggleModal('video-demo-modal', false)
    if (e.target === imageModal) toggleModal('image-preview-modal', false)
    if (e.target === authReqModal) toggleModal('auth-required-modal', false)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleModal('checkout-modal', false)
      toggleModal('free-tab-modal', false)
      toggleModal('video-demo-modal', false)
      toggleModal('image-preview-modal', false)
      toggleModal('auth-required-modal', false)
    }
  })

  const copySyntaxBtn = document.getElementById('copy-syntax-btn')
  if (copySyntaxBtn) {
    copySyntaxBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(activeCheckoutSyntax).then(() => {
        showToast('Đã copy cú pháp: ' + activeCheckoutSyntax)
      }).catch(() => {
        showToast('Trình duyệt không hỗ trợ copy tự động!', 'error')
      })
    })
  }

  const copyStkBtn = document.getElementById('copy-stk-btn')
  if (copyStkBtn) {
    copyStkBtn.addEventListener('click', () => {
      const stk = '03970202801'
      navigator.clipboard.writeText(stk).then(() => {
        showToast('Đã copy STK: ' + stk)
      }).catch(() => {
        showToast('Lỗi khi copy', 'error')
      })
    })
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSearchAndFilter()
  initModalInteractions()
  loadData()
})
