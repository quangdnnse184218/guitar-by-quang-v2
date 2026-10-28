import { applyCheckoutLoginGate } from './lib/login-gate.js'
import {
  initNavbarShrink,
  initMobileMenu,
  initCardTouchFeedback,
  initHeaderOverlapFix,
} from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import {
  fetchAllSongs,
  fetchSongPopularity,
  readCachedSongs,
  extractYoutubeId,
  normalizeVideoPath,
  normalizeAudioPath,
} from './lib/songs-service.js'
import { applyScrollReveal } from './animations/scroll-reveal.js'
import { toggleCompleted, getCompleted } from './lib/local-storage-service.js'
import { supabase } from './lib/supabase.js'
import { renderSongCard } from './lib/song-card.js'
import { levelTier, isNewSong, hotSongIds, parseLevel } from './lib/song-format.js'
import { initShareButtons } from './lib/share-song.js'
import { withReturnTo } from './lib/navigate.js'
import { createOrderAndBuildQr, downloadQrImage, watchOrderPayment } from './lib/checkout-order.js'
import { initHssvFlow } from './lib/hssv-flow.js'

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
// Bộ lọc: các nhóm chọn một (giá, độ khó, thể loại) — bấm lại chip đang bật là bỏ lọc;
// nhóm "Của tôi" chọn nhiều.
const DEFAULT_FILTERS = { price: 'all', level: 'all', category: 'all' }
let filters = { ...DEFAULT_FILTERS }
let mineFilters = new Set() // purchased | favorite | learned | unlearned
let sortMode = 'default'
// Số lượt mở khoá theo bài (cho nhãn "Bán chạy" và sắp xếp), và tập bài đang "Bán chạy".
let buysBySong = new Map()
let hotIds = new Set()
const VIEW_KEY = 'gbq_kho_view'
let viewMode = 'grid'
let searchQuery = ''
let isLoggedIn = false
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
  isLoggedIn = Boolean(session?.user)
  if (!session?.user) {
    favoriteSongIds = new Set()
    return
  }
  const { data, error } = await supabase
    .from('favorites')
    .select('song_id')
    .eq('user_id', session.user.id)
  if (error) {
    console.warn('[kho-tab] Không thể tải danh sách yêu thích:', error.message)
    return
  }
  favoriteSongIds = new Set((data || []).map((r) => String(r.song_id)))
}

// Songs the logged-in user already bought — used to block re-purchase and
// show an "Đã mua" state on the card instead of the checkout flow.
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
  const { data, error } = await supabase
    .from('purchases')
    .select('song_id')
    .eq('user_id', session.user.id)
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

window.showToast = function showToast(msg, type = 'success', action = null) {
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)

  const toastIcon = document.getElementById('toast-icon')

  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg
  // Nút hành động (vd "Đăng nhập") — tạo bằng DOM, không ghép chuỗi HTML
  if (action) {
    const link = document.createElement('a')
    link.href = action.href
    link.textContent = action.label
    link.className = 'ml-2 underline underline-offset-2 whitespace-nowrap'
    toastMessage.append(' ', link)
  }

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
// ==========================================================================
// RENDER & FILTER LIST
// ==========================================================================
function removeAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** "6.5/10" → 6.5 (dùng cho sắp xếp theo độ khó); thiếu thì coi như giữa thang. */
function levelNumber(song) {
  return parseLevel(song.level)
}

function activeFilterCount() {
  return (
    Object.keys(DEFAULT_FILTERS).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).length +
    mineFilters.size
  )
}

function applyFilters(songs) {
  const learned = new Set(getCompleted().map(String))
  let list = songs.filter((s) => {
    const id = String(s.id)
    const free = Boolean(s.is_free || s.isFree)
    if (filters.price === 'free' && !free) return false
    if (filters.price === 'paid' && free) return false
    if (filters.level !== 'all' && levelTier(s.level) !== filters.level) return false
    if (filters.category !== 'all' && (s.category || '') !== filters.category) return false
    if (mineFilters.has('purchased') && !purchasedSongIds.has(id)) return false
    if (mineFilters.has('favorite') && !favoriteSongIds.has(id)) return false
    if (mineFilters.has('learned') && !learned.has(id)) return false
    if (mineFilters.has('unlearned') && learned.has(id)) return false
    return true
  })

  if (searchQuery) {
    const q = removeAccents(searchQuery)
    list = list.filter(
      (s) => removeAccents(s.title || '').includes(q) || removeAccents(s.singer || '').includes(q)
    )
  }

  if (sortMode === 'easy') list = [...list].sort((x, y) => levelNumber(x) - levelNumber(y))
  else if (sortMode === 'hard') list = [...list].sort((x, y) => levelNumber(y) - levelNumber(x))
  else if (sortMode === 'newest')
    list = [...list].sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0))
  else if (sortMode === 'hot')
    list = [...list].sort(
      (x, y) => (buysBySong.get(String(y.id)) || 0) - (buysBySong.get(String(x.id)) || 0)
    )
  else if (sortMode === 'az')
    list = [...list].sort((x, y) => (x.title || '').localeCompare(y.title || '', 'vi'))
  return list
}

function updateGrid() {
  const grid = document.getElementById('songs-grid')
  if (!grid) return

  const filtered = applyFilters(allSongs)
  const count = activeFilterCount()

  const resultCount = document.getElementById('result-count')
  if (resultCount) resultCount.textContent = `${filtered.length} bài`
  const reset = document.getElementById('filter-reset')
  if (reset) reset.disabled = count === 0 && !searchQuery

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-16 px-6 rounded-2xl border border-dashed border-glass-border">
      <p class="text-sm font-bold text-text-primary">Không có bài nào khớp bộ lọc</p>
      <p class="text-xs text-text-muted mt-1">Thử bỏ bớt điều kiện lọc hoặc đổi từ khoá.</p>
      <button type="button" data-reset-filters class="mt-3 px-4 py-2 rounded-full bg-glass-bg border border-glass-border text-xs font-bold text-accent-primary cursor-pointer">Xoá lọc</button>
    </div>`
    grid.querySelector('[data-reset-filters]')?.addEventListener('click', resetFilters)
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
        isNew: isNewSong(song.created_at),
        isHot: hotIds.has(String(song.id)),
      })
    )
    .join('')
  grid.innerHTML = html

  setTimeout(() => {
    applyScrollReveal('.song-card')
  }, 50)
}

function syncChips() {
  document.querySelectorAll('.filter-bar .filter-chip[data-filter]').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.value === filters[chip.dataset.filter]))
  })
  document.querySelectorAll('.filter-bar .filter-chip[data-mine]').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(mineFilters.has(chip.dataset.mine)))
  })
}

function resetFilters() {
  filters = { ...DEFAULT_FILTERS }
  mineFilters = new Set()
  searchQuery = ''
  const searchInput = document.getElementById('search-input')
  if (searchInput) searchInput.value = ''
  syncChips()
  updateGrid()
}

/** Thể loại lấy từ dữ liệu thật; chip "Đã mua"/"Yêu thích" chỉ hiện khi đã đăng nhập. */
function populateFilterOptions() {
  const group = document.getElementById('filter-categories')
  if (group) {
    const cats = [...new Set(allSongs.map((s) => s.category).filter(Boolean))].sort((x, y) =>
      x.localeCompare(y, 'vi')
    )
    group.innerHTML = ''
    cats.forEach((cat) => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'filter-chip'
      chip.dataset.filter = 'category'
      chip.dataset.value = cat
      chip.setAttribute('aria-pressed', 'false')
      chip.textContent = cat
      group.appendChild(chip)
    })
  }
  document
    .querySelectorAll('.filter-bar .account-only')
    .forEach((el) => el.classList.toggle('hidden', !isLoggedIn))
  syncChips()
}

/** Kiểu xem lưới / danh sách, nhớ lại cho lần sau. */
function setViewMode(mode, { persist = true } = {}) {
  viewMode = mode === 'list' ? 'list' : 'grid'
  document.getElementById('songs-grid')?.classList.toggle('is-list', viewMode === 'list')
  document.getElementById('view-grid')?.setAttribute('aria-pressed', String(viewMode === 'grid'))
  document.getElementById('view-list')?.setAttribute('aria-pressed', String(viewMode === 'list'))
  if (!persist) return
  try {
    localStorage.setItem(VIEW_KEY, viewMode)
  } catch {
    // Trình duyệt chặn localStorage — vẫn đổi được, chỉ là không nhớ cho lần sau.
  }
}

function initSearchAndFilter() {
  document.getElementById('search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value
    updateGrid()
  })
  document.getElementById('sort-select')?.addEventListener('change', (e) => {
    sortMode = e.target.value
    updateGrid()
  })

  // Chip lọc — bắt ở cấp thanh lọc để chip thể loại thêm sau vẫn chạy.
  document.querySelector('.filter-bar')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip')
    if (!chip) return

    if (chip.dataset.filter) {
      const key = chip.dataset.filter
      // Bấm lại chip đang bật = bỏ lọc nhóm đó.
      filters[key] = filters[key] === chip.dataset.value ? 'all' : chip.dataset.value
    } else if (chip.dataset.mine) {
      const key = chip.dataset.mine
      if (mineFilters.has(key)) {
        mineFilters.delete(key)
      } else {
        mineFilters.add(key)
        // "Đã học" và "Chưa học" loại trừ nhau
        if (key === 'learned') mineFilters.delete('unlearned')
        if (key === 'unlearned') mineFilters.delete('learned')
      }
    }
    syncChips()
    updateGrid()
  })
  document.getElementById('filter-reset')?.addEventListener('click', resetFilters)

  document.getElementById('view-grid')?.addEventListener('click', () => setViewMode('grid'))
  document.getElementById('view-list')?.addEventListener('click', () => setViewMode('list'))
  let saved = 'grid'
  try {
    saved = localStorage.getItem(VIEW_KEY) || 'grid'
  } catch {
    // Không đọc được lựa chọn cũ — dùng dạng lưới mặc định.
  }
  setViewMode(saved, { persist: false })
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
  // Nhãn "Bán chạy" không đáng để chặn việc hiện danh sách: tải song song, về trước thì tốt,
  // về sau thì vẽ lại lưới.
  fetchSongPopularity().then((popularity) => {
    buysBySong = new Map(popularity.map((p) => [String(p.song_id), Number(p.buys)]))
    hotIds = hotSongIds(popularity)
    if (allSongs.length > 0) updateGrid()
  })

  // Khách chưa đăng nhập (đa số): vẽ ngay từ bản đã lưu lần trước, đỡ đợi mạng. Người đã đăng
  // nhập thì chờ đủ dữ liệu — vẽ sớm sẽ nháy nút "Mua tab" trên bài họ đã sở hữu.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const cached = session?.user ? null : readCachedSongs()
  if (cached) {
    allSongs = cached
    populateFilterOptions()
    applyUrlFilters()
    updateGrid()
  }

  const [songs] = await Promise.all([fetchAllSongs(), loadFavoriteIds(), loadPurchasedIds()])
  const changed = !cached || JSON.stringify(songs) !== JSON.stringify(cached)
  allSongs = songs
  if (changed) {
    populateFilterOptions()
    if (!cached) applyUrlFilters()
    updateGrid()
  }
  openSongFromUrlParam()
  focusSearchFromHash()
}

/** Link từ chân trang: /kho-tab.html?gia=mien-phi (hoặc tra-phi) mở sẵn bộ lọc giá. Giá trị lạ thì bỏ qua. */
const PRICE_PARAM = { 'mien-phi': 'free', 'tra-phi': 'paid' }
function applyUrlFilters() {
  const price = PRICE_PARAM[new URLSearchParams(window.location.search).get('gia')]
  if (!price) return
  filters.price = price
  syncChips()
}

/** Nút kính lúp ở header trỏ /kho-tab.html#tim: đưa con trỏ vào ô tìm bài. */
function focusSearchFromHash() {
  if (window.location.hash !== '#tim') return
  const input = document.getElementById('search-input')
  if (!input) return
  input.scrollIntoView({ block: 'center' })
  input.focus({ preventScroll: true })
}
window.addEventListener('hashchange', focusSearchFromHash)

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
    showToast('Đăng nhập để lưu bài yêu thích.', 'info', {
      label: 'Đăng nhập',
      href: withReturnTo('/login.html'),
    })
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
        'relative before:absolute before:-inset-2 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-rose-500 text-white'
      btn.title = 'Bỏ yêu thích'
      btn.innerHTML = `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" aria-hidden="true" data-ph="heart" viewBox="0 0 256 256" fill="currentColor"><path d="M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z"/></svg>`
    } else {
      btn.className =
        'relative before:absolute before:-inset-2 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Yêu thích'
      btn.innerHTML = `<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" aria-hidden="true" data-ph="heart" viewBox="0 0 256 256" fill="currentColor"><path d="M178,36c-20.09,0-37.92,7.93-50,21.56C115.92,43.93,98.09,36,78,36a66.08,66.08,0,0,0-66,66c0,72.34,105.81,130.14,110.31,132.57a12,12,0,0,0,11.38,0C138.19,232.14,244,174.34,244,102A66.08,66.08,0,0,0,178,36Zm-5.49,142.36A328.69,328.69,0,0,1,128,210.16a328.69,328.69,0,0,1-44.51-31.8C61.82,159.77,36,131.42,36,102A42,42,0,0,1,78,60c17.8,0,32.7,9.4,38.89,24.54a12,12,0,0,0,22.22,0C145.3,69.4,160.2,60,178,60a42,42,0,0,1,42,42C220,131.42,194.18,159.77,172.51,178.36Z"/></svg>`
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
      btn.innerHTML = `<svg class="w-3.5 h-3.5" aria-hidden="true" data-ph="check" viewBox="0 0 256 256" fill="currentColor"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>`
    } else {
      btn.className =
        'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Đã học xong'
      btn.innerHTML = `<svg class="w-3.5 h-3.5" aria-hidden="true" data-ph="check" viewBox="0 0 256 256" fill="currentColor"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>`
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

  // Chưa đăng nhập vẫn xem được chi tiết; chỉ khoá phần thanh toán (không tạo đơn, không hiện QR).
  let currentUserId = null
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.user) {
      currentUserId = session.user.id
      activeUserId = currentUserId
    }
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
    metaEl.textContent = `Độ khó ${tab.level || `${tab.level_num ?? tab.levelNum ?? 5}/10`} · Tuning ${tab.tuning || 'Standard'} · Capo ${tab.capo || 'không kẹp'}`
  // Máy tính còn chỗ ở cột trái nên mở sẵn phần chi tiết; điện thoại để gập cho gọn.
  document
    .querySelector('#checkout-modal details')
    ?.toggleAttribute('open', window.matchMedia('(min-width: 768px)').matches)
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
  hssvFlow.reset({ available: Boolean(currentUserId) && Boolean(discountNote) })
  applyCheckoutLoginGate(tab, Boolean(currentUserId))

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
        hssvFlow.orderReady()
        if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax
        if (qrImgEl) qrImgEl.src = qrUrl
        if (qrTriggerEl) {
          qrTriggerEl.onclick = () =>
            window.openImageModal(
              qrUrl,
              'Mã QR chuyển khoản TPBank (03970202801)',
              'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
            )
        }

        // Tự động phát hiện khi SePay webhook xác nhận thanh toán — không cần
        // người dùng tự bấm làm mới hay đoán xem đã cấp quyền chưa.
        stopOrderWatch = watchOrderPayment(orderCode, {
          // Admin áp giá HSSV bằng tay (khách nhắn Zalo) hoặc duyệt lượt đang chờ → đổi mã QR ngay
          onAmountChange: (amount) => hssvFlow.applyPrice(amount, { byAdmin: true }),
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
  const checkoutModal = document.getElementById('checkout-modal')
  const freeTabModal = document.getElementById('free-tab-modal')
  const videoDemoModal = document.getElementById('video-demo-modal')
  const imageModal = document.getElementById('image-preview-modal')

  if (closeCheckoutBtn)
    closeCheckoutBtn.addEventListener('click', () => toggleModal('checkout-modal', false))
  if (closeFreeBtn)
    closeFreeBtn.addEventListener('click', () => toggleModal('free-tab-modal', false))
  if (closeVideoDemoBtn)
    closeVideoDemoBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))
  if (closeImageBtn)
    closeImageBtn.addEventListener('click', () => toggleModal('image-preview-modal', false))

  window.addEventListener('click', (e) => {
    if (e.target === checkoutModal) toggleModal('checkout-modal', false)
    if (e.target === freeTabModal) toggleModal('free-tab-modal', false)
    if (e.target === videoDemoModal) toggleModal('video-demo-modal', false)
    if (e.target === imageModal) toggleModal('image-preview-modal', false)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      toggleModal('checkout-modal', false)
      toggleModal('free-tab-modal', false)
      toggleModal('video-demo-modal', false)
      toggleModal('image-preview-modal', false)
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
}

// Khối "Giá học sinh / sinh viên" của hộp thanh toán — dùng chung 3 trang, xem src/lib/hssv-flow.js.
const hssvFlow = initHssvFlow({
  getOrder: () => activeOrder,
  getUserId: () => activeUserId,
  getOrderCode: () => activeCheckoutSyntax,
})

document.addEventListener('DOMContentLoaded', () => {
  initSearchAndFilter()
  initModalInteractions()
  initSwipeToFavorite()
  loadData()
})
