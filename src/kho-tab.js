import {
  initNavbarShrink,
  initMobileMenu,
  initCardTouchFeedback,
  initHeaderOverlapFix,
} from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import {
  fetchAllSongs,
  extractYoutubeId,
  normalizeVideoPath,
  normalizeAudioPath,
} from './lib/songs-service.js'
import { applyScrollReveal } from './animations/scroll-reveal.js'
import { toggleCompleted } from './lib/local-storage-service.js'
import { supabase } from './lib/supabase.js'
import { renderSongCard } from './lib/song-card.js'
import { initShareButtons } from './lib/share-song.js'
import {
  createOrderAndBuildQr,
  downloadQrImage,
  watchOrderPayment,
  uploadAndVerifyHssvCard,
  buildVietQrUrl,
} from './lib/checkout-order.js'

// Initialize UI
initNavbarShrink()
initMobileMenu()
initHeaderOverlapFix()
initThemeToggle()
initCardTouchFeedback()

// ==========================================================================
// STATE
// ==========================================================================
let allSongs = []
let activeFilter = 'all' // all, free, paid
let searchQuery = ''
let activeCheckoutSyntax = ''
// Bài đang mở trong modal — để nút chia sẻ biết đang chia sẻ bài nào.
let activeShareSong = null
// Đơn hàng + user của lượt thanh toán đang mở — cần để nút "Xác minh thẻ
// HSSV" biết đang xác minh cho đơn nào, xem initModalInteractions().
let activeOrder = null
let activeUserId = null

// Favorites are an account feature — no localStorage fallback for guests.
// Populated from Supabase on load (empty for anonymous visitors).
let favoriteSongIds = new Set()

async function loadFavoriteIds() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) {
    favoriteSongIds = new Set()
    return
  }
  const { data, error } = await supabase.from('favorites').select('song_id').eq('user_id', session.user.id)
  if (error) {
    console.warn('[kho-tab] Không thể tải danh sách yêu thích:', error.message)
    return
  }
  favoriteSongIds = new Set((data || []).map((r) => String(r.song_id)))
}

// Songs the logged-in user already bought — used to block re-purchase and
// show an "Đã Mua" state on the card instead of the checkout flow.
let purchasedSongIds = new Set()

// Hàm hủy theo dõi đơn hàng đang chờ thanh toán (xem watchOrderPayment) —
// chỉ có 1 đơn được theo dõi tại 1 thời điểm (modal thanh toán chỉ mở 1 lúc).
let stopOrderWatch = null

async function loadPurchasedIds() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) {
    purchasedSongIds = new Set()
    return
  }
  const { data, error } = await supabase.from('purchases').select('song_id').eq('user_id', session.user.id)
  if (error) {
    console.warn('[kho-tab] Không thể tải danh sách đã mua:', error.message)
    return
  }
  purchasedSongIds = new Set((data || []).map((r) => String(r.song_id)))
}

window.navigateToPurchasesTab = function () {
  window.location.href = '/user-dashboard.html#purchases'
}

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
// RENDER & FILTER LIST
// ==========================================================================
function removeAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function updateGrid() {
  const grid = document.getElementById('songs-grid')
  if (!grid) return

  let filtered = allSongs

  // Lọc theo tag
  if (activeFilter === 'free') {
    filtered = filtered.filter((s) => s.is_free || s.isFree)
  } else if (activeFilter === 'paid') {
    filtered = filtered.filter((s) => !s.is_free && !s.isFree)
  }

  // Lọc theo search
  if (searchQuery) {
    const q = removeAccents(searchQuery)
    filtered = filtered.filter((s) => {
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

  const html = filtered
    .map((song) =>
      renderSongCard(song, {
        isPinned: Boolean(song.is_featured),
        isFavorite: favoriteSongIds.has(String(song.id)),
        isPurchased: purchasedSongIds.has(String(song.id)),
        showFavoriteButton: true,
        showSwipeOverlay: true,
      })
    )
    .join('')
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

  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => {
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
// SWIPE-TO-FAVORITE (Feature-detects touch; delegated on the grid container
// so it keeps working after updateGrid() replaces the cards' innerHTML)
// ==========================================================================
function initSwipeToFavorite() {
  const grid = document.getElementById('songs-grid')
  if (!grid) return

  const DRAG_CAP = 90
  const THRESHOLD = 60
  let state = null

  grid.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length > 1) return
      const card = e.target.closest('.song-card')
      if (!card) return
      const t = e.touches[0]
      state = { card, startX: t.clientX, startY: t.clientY, locked: null, dx: 0 }
    },
    { passive: true }
  )

  grid.addEventListener(
    'touchmove',
    (e) => {
      if (!state) return
      const t = e.touches[0]
      const dx = t.clientX - state.startX
      const dy = t.clientY - state.startY

      if (state.locked === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        state.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (state.locked !== 'x') return

      e.preventDefault()
      const clamped = Math.max(0, Math.min(dx, DRAG_CAP))
      state.dx = clamped
      state.card.style.transform = `translateX(${clamped}px)`
      const overlay = state.card.querySelector('.swipe-fav-overlay')
      if (overlay) overlay.style.opacity = String(Math.min(1, clamped / (THRESHOLD + 10)))
    },
    { passive: false }
  )

  const endSwipe = () => {
    if (!state) return
    const { card, dx } = state
    const overlay = card.querySelector('.swipe-fav-overlay')

    card.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    if (overlay) overlay.style.transition = 'opacity 0.3s ease'

    if (dx > THRESHOLD) {
      // Reuse the same handler as the heart button: it persists to
      // localStorage AND syncs to Supabase `favorites` when logged in, and
      // updates every [data-fav-btn] for this song — a plain toggleFavorite()
      // call here would only touch localStorage, leaving the dashboard's
      // "Yêu thích" tab (which reads from Supabase) out of sync.
      window.handleToggleFavorite(null, card.dataset.id)
    }

    card.style.transform = 'translateX(0)'
    if (overlay) overlay.style.opacity = '0'

    setTimeout(() => {
      card.style.transition = ''
      if (overlay) overlay.style.transition = ''
    }, 320)
    state = null
  }

  grid.addEventListener('touchend', endSwipe, { passive: true })
  grid.addEventListener('touchcancel', endSwipe, { passive: true })
}

// ==========================================================================
// LOAD DATA
// ==========================================================================
async function loadData() {
  const [songs] = await Promise.all([fetchAllSongs(), loadFavoriteIds(), loadPurchasedIds()])
  allSongs = songs
  updateGrid()
  openSongFromUrlParam()
}

/**
 * Mở đúng bài khi vào bằng link chia sẻ dạng /kho-tab.html?tab=<id>.
 * Dự án không có trang riêng cho từng bài, nên link chia sẻ trỏ về kho tab kèm
 * tham số này rồi tự bật modal của bài đó lên — người nhận bấm link là thấy
 * ngay bài được chia sẻ thay vì phải tự tìm giữa cả kho.
 */
function openSongFromUrlParam() {
  const songId = new URLSearchParams(window.location.search).get('tab')
  if (!songId) return

  const song = allSongs.find((s) => String(s.id) === String(songId))
  if (!song) {
    showToast('Không tìm thấy bài hát trong link chia sẻ — có thể bài đã bị gỡ.', 'info')
    return
  }

  // Cuộn tới đúng thẻ bài rồi mở modal, để lúc đóng modal vẫn thấy bài đó.
  document.querySelector(`.song-card[data-id="${CSS.escape(String(song.id))}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })

  if (song.is_free) {
    window.openFreeTabModal(song.id)
  } else {
    window.openCheckoutModal?.(song.id)
  }
}

// ==========================================================================
// FAVORITE & COMPLETED HANDLERS (Copied from main.js)
// ==========================================================================
// Favorites require a real account — this always writes straight to Supabase
// `favorites` (never localStorage), and refuses anonymous visitors outright
// rather than silently keeping a local-only list that doesn't mean anything.
window.handleToggleFavorite = async function handleToggleFavorite(event, songId) {
  if (event) event.stopPropagation()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) {
    showToast('Vui lòng đăng nhập để lưu bài hát yêu thích!', 'info')
    return
  }

  const sId = String(songId)
  const nextState = !favoriteSongIds.has(sId)

  try {
    if (nextState) {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: session.user.id, song_id: sId })
      if (error) throw error
      favoriteSongIds.add(sId)
    } else {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .match({ user_id: session.user.id, song_id: sId })
      if (error) throw error
      favoriteSongIds.delete(sId)
    }
  } catch (err) {
    showToast('Lỗi khi cập nhật yêu thích: ' + err.message, 'error')
    return
  }

  const btns = document.querySelectorAll(`[data-fav-btn="${sId}"]`)
  btns.forEach((btn) => {
    if (nextState) {
      btn.className =
        'flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-rose-500 text-white'
      btn.title = 'Bỏ yêu thích'
      btn.innerHTML = `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    } else {
      btn.className =
        'flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Yêu thích'
      btn.innerHTML = `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`
    }
  })
  showToast(nextState ? 'Đã lưu vào danh sách Yêu thích ❤️' : 'Đã bỏ khỏi danh sách Yêu thích')
}

window.handleToggleCompleted = function handleToggleCompleted(event, songId) {
  if (event) event.stopPropagation()
  const nextState = toggleCompleted(songId)
  const btns = document.querySelectorAll(`[data-comp-btn="${songId}"]`)
  btns.forEach((btn) => {
    if (nextState) {
      btn.className =
        'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-emerald-500 text-white scale-105'
      btn.title = 'Đánh dấu chưa học'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    } else {
      btn.className =
        'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
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
    modal.querySelectorAll('video').forEach((v) => v.pause())
    modal.querySelectorAll('audio').forEach((a) => {
      a.pause()
      a.currentTime = 0
    })
    const iframe = modal.querySelector('iframe')
    if (iframe) iframe.src = ''

    if (modalId === 'checkout-modal' && stopOrderWatch) {
      stopOrderWatch()
      stopOrderWatch = null
    }

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

window.openVideoDemoModal = function openVideoDemoModal(title, mediaSrc, isAudio = false) {
  if (!title || !mediaSrc) return
  const titleEl = document.getElementById('video-demo-title')
  const videoEl = document.getElementById('demo-modal-video')
  const iframeEl = document.getElementById('demo-modal-iframe')
  const audioContainer = document.getElementById('demo-modal-audio-container')
  const audioEl = document.getElementById('demo-modal-audio')

  if (titleEl) titleEl.textContent = title

  const isAudioFile = isAudio || /\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(mediaSrc)

  if (isAudioFile && audioEl && audioContainer) {
    if (iframeEl) {
      iframeEl.src = ''
      iframeEl.classList.add('hidden')
    }
    if (videoEl) {
      videoEl.pause?.()
      videoEl.src = ''
      videoEl.classList.add('hidden')
    }
    const cleanSrc = normalizeAudioPath(mediaSrc)
    const encodedSrc = cleanSrc.startsWith('http') ? cleanSrc : encodeURI(cleanSrc)
    audioEl.src = encodedSrc
    audioContainer.classList.remove('hidden')
    audioEl.currentTime = 0
    audioEl.load()
    audioEl.play().catch(() => {})
  } else {
    if (audioContainer && audioEl) {
      audioEl.pause?.()
      audioEl.src = ''
      audioContainer.classList.add('hidden')
    }

    const ytId = extractYoutubeId(mediaSrc)

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
      const cleanSrc = normalizeVideoPath(mediaSrc)
      const encodedSrc = cleanSrc.startsWith('http') ? cleanSrc : encodeURI(cleanSrc)
      videoEl.src = encodedSrc
      const sourceEl = videoEl.querySelector('source')
      if (sourceEl) sourceEl.src = encodedSrc
      videoEl.classList.remove('hidden')
      videoEl.currentTime = 0
      videoEl.load()
      videoEl.play().catch(() => {})
    }
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

window.downloadCheckoutQr = function downloadCheckoutQr() {
  const qrImgEl = document.getElementById('modal-qr-img')
  if (!qrImgEl?.src) return
  downloadQrImage(qrImgEl.src).catch((err) => {
    console.error('Không tải được ảnh QR:', err)
    showToast('Không tải được ảnh QR, thử lại nhé!', 'error')
  })
}

window.openCheckoutModal = async function openCheckoutModal(tabId) {
  if (!allSongs || !allSongs.length) return
  const tab = allSongs.find((t) => t.id === tabId)
  if (!tab) return

  // Gate Check for paid cards: MUST BE LOGGED IN
  let currentUserId = null
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session || !session.user) {
      const loginBtn = document.getElementById('auth-required-login-btn')
      if (loginBtn) {
        loginBtn.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      }
      toggleModal('auth-required-modal', true)
      return
    }
    currentUserId = session.user.id
    activeUserId = currentUserId
  } catch (e) {
    console.warn('Auth check error in openCheckoutModal:', e)
  }

  // Already owns this tab — send to purchases instead of re-selling it.
  if (purchasedSongIds.has(String(tabId))) {
    window.navigateToPurchasesTab()
    return
  }

  const titleEl = document.getElementById('modal-tab-title')
  const metaEl = document.getElementById('modal-tab-meta')
  const priceEl = document.getElementById('modal-tab-price')
  const syntaxEl = document.getElementById('modal-transfer-syntax')
  const qrImgEl = document.getElementById('modal-qr-img')
  const qrTriggerEl = document.getElementById('qr-preview-trigger')
  const discountTag = document.getElementById('modal-discount-tag')
  const levelEl = document.getElementById('modal-tab-level')
  const tuningEl = document.getElementById('modal-tab-tuning')
  const capoEl = document.getElementById('modal-tab-capo')
  const tempoEl = document.getElementById('modal-tab-tempo')
  const durationEl = document.getElementById('modal-tab-duration')
  const videoEl = document.getElementById('checkout-modal-video')
  const videoSrcEl = document.getElementById('checkout-modal-video-source')
  const videoContainer = document.getElementById('checkout-modal-video-container')
  const audioEl = document.getElementById('checkout-modal-audio')
  const audioContainer = document.getElementById('checkout-modal-audio-container')

  if (titleEl) titleEl.textContent = tab.title
  if (metaEl)
    metaEl.textContent = `Tuning: ${tab.tuning || 'Standard'} • Bản Video Tab chạy nốt đồng bộ với âm thanh đàn mộc thật và nhịp gõ`
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

  // Reset khối HSSV về trạng thái ban đầu mỗi lần mở modal cho 1 bài mới —
  // chỉ hiện nếu bài có giá ưu đãi (discount_note), ẩn hẳn nếu không.
  activeOrder = null
  const hssvBlock = document.getElementById('modal-hssv-block')
  const hssvCheckbox = document.getElementById('modal-hssv-checkbox')
  const hssvPanel = document.getElementById('modal-hssv-upload-panel')
  const hssvFileInput = document.getElementById('modal-hssv-file-input')
  const hssvVerifyBtn = document.getElementById('modal-hssv-verify-btn')
  const hssvStatus = document.getElementById('modal-hssv-status')
  if (hssvBlock) hssvBlock.classList.toggle('hidden', !discountNote)
  if (hssvCheckbox) hssvCheckbox.checked = false
  if (hssvPanel) hssvPanel.classList.add('hidden')
  if (hssvFileInput) hssvFileInput.value = ''
  if (hssvVerifyBtn) {
    hssvVerifyBtn.disabled = true
    hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
  }
  if (hssvStatus) {
    hssvStatus.classList.add('hidden')
    hssvStatus.textContent = ''
  }

  const cleanSongCode = tab.title
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
  activeCheckoutSyntax = `VIDEOTAB ${cleanSongCode}`
  if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax

  // Tạo đơn hàng riêng + QR nhúng sẵn số tiền/nội dung — để SePay webhook tự
  // đối chiếu đúng người-đúng bài khi có tiền vào, thay vì phải cấp quyền tay.
  if (stopOrderWatch) {
    stopOrderWatch()
    stopOrderWatch = null
  }

  if (currentUserId) {
    createOrderAndBuildQr(currentUserId, tab)
      .then(({ orderCode, qrUrl, order }) => {
        if (!orderCode) return
        activeOrder = order
        activeCheckoutSyntax = orderCode
        if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax
        if (qrImgEl) qrImgEl.src = qrUrl
        if (qrTriggerEl) {
          qrTriggerEl.onclick = () =>
            window.openImageModal(
              qrUrl,
              'Mã QR Chuyển Khoản TPBank (03970202801)',
              'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
            )
        }

        // Tự động phát hiện khi SePay webhook xác nhận thanh toán — không cần
        // người dùng tự bấm làm mới hay đoán xem đã cấp quyền chưa.
        stopOrderWatch = watchOrderPayment(orderCode, {
          onPaid: () => {
            stopOrderWatch = null
            purchasedSongIds.add(String(tab.id))
            toggleModal('checkout-modal', false)
            window.showToast(`Chuyển khoản thành công! Đã mở khoá "${tab.title}" 🎉`, 'success')
            setTimeout(() => window.navigateToPurchasesTab(), 1200)
          },
        })
      })
      .catch((err) => console.warn('Không tạo được đơn hàng tự động:', err))
  }

  const videoDemo = tab.demo_video_url || tab.video_demo || tab.videoDemo || tab.youtube_id || ''
  const audioDemo = tab.audio_demo || tab.demo_audio_url || tab.audio_url || ''

  if (videoEl && videoContainer) {
    if (videoDemo) {
      const cleanVideo = normalizeVideoPath(videoDemo)
      const encodedVideo = cleanVideo.startsWith('http') ? cleanVideo : encodeURI(cleanVideo)
      videoEl.src = encodedVideo
      if (videoSrcEl) videoSrcEl.src = encodedVideo
      videoEl.load()
      videoContainer.classList.remove('hidden')
    } else {
      videoEl.src = ''
      videoContainer.classList.add('hidden')
    }
  }

  if (audioEl && audioContainer) {
    if (audioDemo) {
      const cleanAudio = normalizeAudioPath(audioDemo)
      const encodedAudio = cleanAudio.startsWith('http') ? cleanAudio : encodeURI(cleanAudio)
      audioEl.src = encodedAudio
      audioEl.load()
      audioContainer.classList.remove('hidden')
    } else {
      audioEl.src = ''
      audioContainer.classList.add('hidden')
    }
  }

  toggleModal('checkout-modal', true)
}

window.openFreeTabModal = function openFreeTabModal(tabId) {
  if (!allSongs || !allSongs.length) return
  const tab = allSongs.find((t) => t.id === tabId)
  if (!tab) return

  activeShareSong = { id: tab.id, title: tab.title }

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
    { key: 'harmonic', label: 'Harmonic' },
  ]
  if (techContainer) {
    const desc = (tab.description || '').toLowerCase()
    let html = ''
    let found = false
    knownTech.forEach((tc) => {
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
  initShareButtons(
    () => activeShareSong,
    (msg) => showToast(msg, 'success')
  )

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

  if (closeCheckoutBtn)
    closeCheckoutBtn.addEventListener('click', () => toggleModal('checkout-modal', false))
  if (closeFreeBtn)
    closeFreeBtn.addEventListener('click', () => toggleModal('free-tab-modal', false))
  if (closeVideoDemoBtn)
    closeVideoDemoBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))
  if (closeImageBtn)
    closeImageBtn.addEventListener('click', () => toggleModal('image-preview-modal', false))
  if (closeAuthReqBtn)
    closeAuthReqBtn.addEventListener('click', () => toggleModal('auth-required-modal', false))

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
      navigator.clipboard
        .writeText(activeCheckoutSyntax)
        .then(() => {
          showToast('Đã copy cú pháp: ' + activeCheckoutSyntax)
        })
        .catch(() => {
          showToast('Trình duyệt không hỗ trợ copy tự động!', 'error')
        })
    })
  }

  const copyStkBtn = document.getElementById('copy-stk-btn')
  if (copyStkBtn) {
    copyStkBtn.addEventListener('click', () => {
      const stk = '03970202801'
      navigator.clipboard
        .writeText(stk)
        .then(() => {
          showToast('Đã copy STK: ' + stk)
        })
        .catch(() => {
          showToast('Lỗi khi copy', 'error')
        })
    })
  }

  initHssvVerification()
}

// Checkbox "Tôi là HSSV" → hiện panel upload ảnh thẻ. Chọn ảnh xong bấm "Xác
// minh" → upload lên bucket riêng tư + gọi Edge Function verify-hssv-card
// (AI kiểm tra thẻ). Nếu đạt, đổi luôn giá + QR sang giá HSSV — không cần
// admin duyệt tay.
function initHssvVerification() {
  const hssvCheckbox = document.getElementById('modal-hssv-checkbox')
  const hssvPanel = document.getElementById('modal-hssv-upload-panel')
  const hssvFileInput = document.getElementById('modal-hssv-file-input')
  const hssvVerifyBtn = document.getElementById('modal-hssv-verify-btn')
  const hssvStatus = document.getElementById('modal-hssv-status')

  if (hssvCheckbox && hssvPanel) {
    hssvCheckbox.addEventListener('change', () => {
      hssvPanel.classList.toggle('hidden', !hssvCheckbox.checked)
    })
  }

  if (hssvFileInput && hssvVerifyBtn) {
    hssvFileInput.addEventListener('change', () => {
      hssvVerifyBtn.disabled = !hssvFileInput.files?.length
    })
  }

  if (hssvVerifyBtn) {
    hssvVerifyBtn.addEventListener('click', async () => {
      const file = hssvFileInput?.files?.[0]
      if (!file || !activeOrder?.id || !activeUserId) return

      hssvVerifyBtn.disabled = true
      hssvVerifyBtn.textContent = 'Đang xác minh...'
      if (hssvStatus) {
        hssvStatus.classList.remove('hidden')
        hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-text-muted'
        hssvStatus.textContent = 'Đang xác minh... chờ chút nhé'
      }

      try {
        const result = await uploadAndVerifyHssvCard(activeUserId, activeOrder.id, file)

        if (result?.approved) {
          activeOrder.amount = result.newAmount || activeOrder.amount
          const qrImgEl = document.getElementById('modal-qr-img')
          const priceEl = document.getElementById('modal-tab-price')
          const discountTag = document.getElementById('modal-discount-tag')
          const newQrUrl = buildVietQrUrl(activeOrder.amount, activeCheckoutSyntax)
          if (qrImgEl) qrImgEl.src = newQrUrl
          const qrTriggerEl = document.getElementById('qr-preview-trigger')
          if (qrTriggerEl) {
            qrTriggerEl.onclick = () =>
              window.openImageModal(
                newQrUrl,
                'Mã QR Chuyển Khoản TPBank (03970202801)',
                'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
              )
          }
          if (priceEl) priceEl.textContent = `${activeOrder.amount.toLocaleString('vi-VN')} VNĐ`
          if (discountTag) discountTag.textContent = '✓ Đã xác minh HSSV'

          if (hssvStatus) {
            hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400'
            hssvStatus.textContent = '✓ Đã xác minh! Mã QR đã đổi sang giá HSSV.'
          }
          hssvVerifyBtn.textContent = 'Đã xác minh ✓'
          if (hssvFileInput) hssvFileInput.disabled = true
        } else {
          if (hssvStatus) {
            hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-rose-600 dark:text-rose-400'
            hssvStatus.textContent =
              result?.reason || 'Không xác minh được thẻ HSSV, bạn có thể thử ảnh khác hoặc thanh toán giá thường.'
          }
          hssvVerifyBtn.disabled = false
          hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
        }
      } catch (err) {
        console.error('Lỗi xác minh HSSV:', err)
        if (hssvStatus) {
          hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-rose-600 dark:text-rose-400'
          hssvStatus.textContent = 'Có lỗi khi xác minh, thử lại giúp mình nhé.'
        }
        hssvVerifyBtn.disabled = false
        hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
      }
    })
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSearchAndFilter()
  initModalInteractions()
  initSwipeToFavorite()
  loadData()
})
