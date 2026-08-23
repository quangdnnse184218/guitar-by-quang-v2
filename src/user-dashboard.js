/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — USER DASHBOARD CONTROLLER (user-dashboard.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs } from './lib/songs-service.js'
import { fetchAllGears, DEFAULT_GEARS } from './lib/gears-service.js'


initNavbarShrink()
initMobileMenu()
initThemeToggle()

// ==========================================================================
// STATE
// ==========================================================================
let currentUser = null
let currentProfile = null
let allSongs = []
let favoriteSongIds = new Set()
let purchasedSongIds = new Set()

// State
let activeTab = 'overview' // 'overview' | 'favorites' | 'purchases' | 'profile'
let favSearchQuery = ''
let favFilter = 'all' // all, free, paid
let purchasedSearchQuery = ''
let purchasedFilter = 'all' // all, free, paid

// DOM References
const adminNoticeBanner = document.getElementById('admin-notice-banner')
const userAvatarInitial = document.getElementById('user-avatar-initial')
const userAvatarImg = document.getElementById('user-avatar-img')
const userRoleBadge = document.getElementById('user-role-badge')
const userDisplayName = document.getElementById('user-display-name')
const userEmailDisplay = document.getElementById('user-email-display')

const statFavCount = document.getElementById('stat-fav-count')
const statPurchasedCount = document.getElementById('stat-purchased-count')
const statJoinDate = document.getElementById('stat-join-date')

const tabFavCounter = document.getElementById('tab-fav-counter')
const tabPurchasedCounter = document.getElementById('tab-purchased-counter')

const dashboardTabBar = document.getElementById('dashboard-tab-bar')
const navTabOverview = document.getElementById('nav-tab-overview')
const navTabFavorites = document.getElementById('nav-tab-favorites')
const navTabPurchases = document.getElementById('nav-tab-purchases')

const sectionOverview = document.getElementById('section-overview')
const sectionFavorites = document.getElementById('section-favorites')
const sectionPurchases = document.getElementById('section-purchases')
const sectionProfile = document.getElementById('section-profile')

const overviewFeaturedTabs = document.getElementById('overview-featured-tabs')
const overviewGearsCarousel = document.getElementById('overview-gears-carousel')
const favoritesGrid = document.getElementById('favorites-grid')
const purchasesGrid = document.getElementById('purchases-grid')

const searchFavInput = document.getElementById('search-fav-input')
const filterFavSelect = document.getElementById('filter-fav-select')
const searchPurchasedInput = document.getElementById('search-purchased-input')
const filterPurchasedSelect = document.getElementById('filter-purchased-select')

// Redemption DOM


// Profile Form
const profileForm = document.getElementById('profile-update-form')
const profileEmailInput = document.getElementById('profile-email-input')
const profileNameInput = document.getElementById('profile-name-input')
const profileAvatarInput = document.getElementById('profile-avatar-input')
const saveProfileBtn = document.getElementById('save-profile-btn')

// Password Form
const changePasswordForm = document.getElementById('change-password-form')
const currentPasswordInput = document.getElementById('current-password')
const newPasswordInput = document.getElementById('new-password')
const confirmNewPasswordInput = document.getElementById('confirm-new-password')
const changePasswordBtn = document.getElementById('change-password-btn')
const pwdBtnText = document.getElementById('pwd-btn-text')
const pwdBtnSpinner = document.getElementById('pwd-btn-spinner')
const passwordAlert = document.getElementById('password-alert')
const passwordAlertText = document.getElementById('password-alert-text')

// Toast Notification
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
const toastIcon = document.getElementById('toast-icon')
let toastTimer = null

export function showToast(msg, type = 'success') {
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)
  
  const toastIconEl = document.getElementById('toast-icon')
  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg

  toastNotification.className = `toast-${type} toast-visible`

  if (toastIconEl) {
    if (type === 'error') {
      toastIconEl.textContent = '✕'
      toastIconEl.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold shadow-md'
    } else if (type === 'info') {
      toastIconEl.textContent = '⟳'
      toastIconEl.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold shadow-md animate-spin'
    } else {
      toastIconEl.textContent = '✓'
      toastIconEl.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-extrabold shadow-md'
    }
  }
  
  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('toast-visible')
  }, 4000)
}

window.showToast = showToast



// ==========================================================================
// TAB SWITCHING LOGIC
// ==========================================================================
function setActiveTab(tab) {
  activeTab = tab
  const tabs = [
    { key: 'overview', btn: navTabOverview, sec: sectionOverview },
    { key: 'favorites', btn: navTabFavorites, sec: sectionFavorites },
    { key: 'purchases', btn: navTabPurchases, sec: sectionPurchases },
    { key: 'profile', btn: null, sec: sectionProfile }
  ]

  const isProfile = tab === 'profile'
  const commonSections = document.getElementById('dashboard-common-sections')

  if (isProfile) {
    dashboardTabBar?.classList.add('hidden')
    commonSections?.classList.add('hidden')
    sectionOverview?.classList.add('hidden')
    sectionFavorites?.classList.add('hidden')
    sectionPurchases?.classList.add('hidden')
    sectionProfile?.classList.remove('hidden')
  } else {
    dashboardTabBar?.classList.remove('hidden')
    commonSections?.classList.remove('hidden')
    sectionProfile?.classList.add('hidden')

    tabs.slice(0, 3).forEach(t => {
      if (t.key === tab) {
        if (t.btn) {
          t.btn.classList.remove('text-text-muted', 'hover:text-text-primary', 'hover:bg-black/5', 'dark:hover:bg-white/5')
          t.btn.classList.add('bg-warm-gradient', 'text-white', 'shadow-md')
        }
        t.sec?.classList.remove('hidden')
      } else {
        if (t.btn) {
          t.btn.classList.remove('bg-warm-gradient', 'text-white', 'shadow-md')
          t.btn.classList.add('text-text-muted', 'hover:text-text-primary')
        }
        t.sec?.classList.add('hidden')
      }
    })
  }

  // Render content accordingly
  if (tab === 'overview') {
    renderOverviewFeatured()
    renderOverviewGears()
  }
  if (tab === 'favorites') renderFavorites()
  if (tab === 'purchases') renderPurchases()
}

window.setActiveDashboardTab = setActiveTab

// Listen for hash changes
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '')
  if (['overview', 'favorites', 'purchases', 'profile'].includes(hash)) {
    setActiveTab(hash)
    if (hash === 'profile') {
      setTimeout(() => {
        sectionProfile?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }
})

navTabOverview?.addEventListener('click', () => { window.location.hash = 'overview'; setActiveTab('overview') })
navTabFavorites?.addEventListener('click', () => { window.location.hash = 'favorites'; setActiveTab('favorites') })
navTabPurchases?.addEventListener('click', () => { window.location.hash = 'purchases'; setActiveTab('purchases') })

// ==========================================================================
// DATA FETCHING
// ==========================================================================
async function checkAuthAndInit() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) {
      window.location.replace('/login.html')
      return
    }

    currentUser = session.user

    // Fetch Profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single()

    currentProfile = profile || {
      full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Thành viên',
      avatar_url: currentUser.user_metadata?.avatar_url || '',
      role: 'user',
      created_at: currentUser.created_at
    }

    // Check if admin
    if (currentProfile.role === 'admin') {
      adminNoticeBanner?.classList.remove('hidden')
      userRoleBadge.innerHTML = '⚡ Quản Trị Viên (Admin)'
      userRoleBadge.className = 'px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[10px] font-bold border border-purple-500/30'
    }

    // Update Header & Banner UI
    updateUserInfoUI()

    // Fetch songs, favorites and purchases concurrently
    const [songs, favRes, purRes] = await Promise.all([
      fetchAllSongs(),
      supabase.from('favorites').select('song_id').eq('user_id', currentUser.id),
      supabase.from('purchases').select('song_id').eq('user_id', currentUser.id)
    ])

    allSongs = songs || []
    favoriteSongIds = new Set((favRes.data || []).map(f => String(f.song_id)))
    purchasedSongIds = new Set((purRes.data || []).map(p => String(p.song_id)))

    updateCounters()
    renderOverviewFeatured()
    renderOverviewGears()

    // Check URL Hash for initial tab
    const hash = window.location.hash.replace('#', '')
    if (['favorites', 'purchases', 'profile'].includes(hash)) {
      setActiveTab(hash)
    } else {
      setActiveTab('overview')
    }

    initFaq()
  } catch (err) {
    console.error('Initialization error:', err)
    showToast('Lỗi tải dữ liệu thành viên. Vui lòng thử lại!', 'error')
  }
}

function updateUserInfoUI() {
  const name = currentProfile.full_name || currentUser.email?.split('@')[0] || 'Thành viên'
  const initial = name.charAt(0).toUpperCase()
  
  if (userDisplayName) userDisplayName.textContent = name
  if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email
  if (userAvatarInitial) userAvatarInitial.textContent = initial

  if (currentProfile.avatar_url && userAvatarImg) {
    userAvatarImg.src = currentProfile.avatar_url
    userAvatarImg.classList.remove('hidden')
    userAvatarInitial?.classList.add('hidden')
  } else {
    userAvatarImg?.classList.add('hidden')
    userAvatarInitial?.classList.remove('hidden')
  }

  // Joined Date
  if (statJoinDate) {
    const d = new Date(currentProfile.created_at || currentUser.created_at || Date.now())
    statJoinDate.textContent = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  // Populate Profile Form
  if (profileEmailInput) profileEmailInput.value = currentUser.email || ''
  if (profileNameInput) profileNameInput.value = name
  if (profileAvatarInput) profileAvatarInput.value = currentProfile.avatar_url || ''
}

function updateCounters() {
  const favCount = favoriteSongIds.size
  const purCount = purchasedSongIds.size

  if (statFavCount) statFavCount.textContent = favCount
  if (statPurchasedCount) statPurchasedCount.textContent = purCount
  if (tabFavCounter) tabFavCounter.textContent = favCount
  if (tabPurchasedCounter) tabPurchasedCounter.textContent = purCount
}

// ==========================================================================
// RENDER OVERVIEW FEATURED TABS (RICH CARDS LIKE LANDING PAGE)
// ==========================================================================
function renderOverviewFeatured() {
  if (!overviewFeaturedTabs) return
  const featured = allSongs.slice(0, 4)

  if (featured.length === 0) {
    overviewFeaturedTabs.innerHTML = '<div class="p-8 text-center text-text-muted text-xs col-span-full">Chưa có bài hát nào trong kho.</div>'
    return
  }

  overviewFeaturedTabs.innerHTML = featured.map(song => {
    const isFav = favoriteSongIds.has(String(song.id))
    const isBought = purchasedSongIds.has(String(song.id))
    const isFree = Boolean(song.is_free)
    const levelStr = String(song.level || '5/10')
    const levelNum = parseFloat(levelStr.replace(/[^0-9.]/g, '')) || 5
    const percent = Math.min(100, Math.max(10, (levelNum / 10) * 100))

    // Top action group: Favorite Heart Button + Check/View status
    const userActionGroup = `
      <div class="flex items-center gap-1" onclick="event.stopPropagation();">
        <button onclick="window.toggleFavoriteSong(event, '${song.id}')" class="btn-fav-song p-1 sm:p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all cursor-pointer shadow-xs ${isFav ? 'text-rose-500 bg-black/70' : ''}" title="${isFav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}">
          <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5 ${isFav ? 'fill-rose-500 stroke-rose-500' : 'fill-none stroke-current'}" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
          </svg>
        </button>
        ${isBought ? `
          <span class="p-1 sm:p-1.5 rounded-full bg-amber-500/80 text-white shadow-xs" title="Đã sở hữu bài hát này">
            <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
          </span>
        ` : ''}
      </div>
    `

    // 1. FREE TAB CARD
    if (isFree) {
      return `
        <div onclick="window.openFreeTabModal('${song.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-glass-border flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer w-full" data-id="${song.id}">
          <div class="space-y-2 sm:space-y-3">
            <!-- Thumbnail Visual (Emerald Green Gradient) -->
            <div class="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-br from-[#1E3A2F] via-[#2A4D3E] to-[#172A22] p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
              <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
                <span class="bg-black/50 backdrop-blur px-1.5 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] font-mono">${song.category || 'Fingerstyle'}</span>
                <div class="flex items-center gap-1 justify-end">
                  ${userActionGroup}
                  <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide">FREE</span>
                </div>
              </div>

              <!-- Center Play Demo Button -->
              <div class="my-auto text-center flex flex-col items-center justify-center py-0.5">
                <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white text-emerald-800 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <svg class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 fill-current ml-0.5" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <span class="text-[8px] sm:text-[10px] font-bold mt-1 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap">Xem Tab Miễn Phí</span>
              </div>

              <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
                <span class="font-mono tabular-nums text-[9px] sm:text-[11px]">${song.duration || '04:15'}</span>
                <span class="text-white/80 text-[8px] sm:text-[11px]">Tuning: ${song.tuning || 'Standard'}</span>
              </div>
            </div>

            <!-- Details -->
            <div class="space-y-1">
              <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-emerald-500 transition-colors leading-tight line-clamp-1">
                ${song.title}
              </h3>

              <div class="space-y-0.5 sm:space-y-1 pt-0.5">
                <div class="flex items-center justify-between text-[10px] sm:text-xs font-bold text-text-muted">
                  <span>Độ khó: <strong class="text-emerald-500 font-mono tabular-nums">${song.level || (levelNum + '/10')}</strong></span>
                  <span class="text-[9px] sm:text-xs font-semibold text-text-muted hidden sm:inline">Tuning: ${song.tuning || 'Standard'}</span>
                </div>
                <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
                  <div class="bg-emerald-500 h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                </div>
              </div>

              <p class="text-[10px] sm:text-xs text-text-muted font-medium leading-snug pt-0.5 line-clamp-2">
                ${song.description || 'Bản tab guitar fingerstyle miễn phí kèm video hướng dẫn.'}
              </p>
            </div>
          </div>

          <div class="pt-1 sm:pt-2">
            <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] sm:text-xs transition-all shadow-xs flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer group-hover:bg-emerald-500/25">
              <span class="truncate">Xem Video Tab (Free)</span>
            </div>
          </div>
        </div>
      `
    }

    // 2. PAID TAB CARD
    const priceFormatted = song.price_formatted || song.price || '239.000đ'
    const discountNote = song.discount_note || 'HSSV ƯU ĐÃI CÒN 179K'
    const videoDemoUrl = song.video_demo_url || song.video_demo || `/assets/${song.id}demo.mp4`

    if (isBought) {
      return `
        <div onclick="window.navigateToPurchasesTab('${song.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer rounded-2xl sm:rounded-3xl border border-amber-500/40 hover:border-amber-400 hover:shadow-xl transition-all w-full" data-id="${song.id}">
          <div class="space-y-2 sm:space-y-3">
            <!-- Thumbnail Visual (Warm Brown/Orange Gradient) -->
            <div class="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-br from-[#9a4b24] via-[#7d3b19] to-[#54240d] p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
              <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
                <span class="bg-black/50 backdrop-blur px-1.5 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] font-mono">${song.category || 'NHẠC VIỆT'}</span>
                <div class="flex items-center gap-1 justify-end">
                  ${userActionGroup}
                  <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide flex items-center gap-0.5">
                    <span>✓</span>
                    <span>ĐÃ SỞ HỮU</span>
                  </span>
                </div>
              </div>

              <!-- Center Play Demo Button -->
              <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.navigateToPurchasesTab('${song.id}')">
                <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white text-[#9a4b24] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <svg class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 fill-current ml-0.5 text-accent-primary" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <span class="text-[8px] sm:text-[10px] font-bold mt-1 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap">Xem Trong Tab Đã Mua</span>
              </div>

              <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
                <span class="font-mono tabular-nums text-[9px] sm:text-[11px]">${song.duration || '03:40'}</span>
                <span class="text-white/80 text-[8px] sm:text-[11px]">Tuning: ${song.tuning || 'Standard'}</span>
              </div>
            </div>

            <!-- Details -->
            <div class="space-y-1">
              <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-tight line-clamp-1">
                ${song.title}
              </h3>

              <div class="space-y-0.5 sm:space-y-1 pt-0.5">
                <div class="flex items-center justify-between text-[10px] sm:text-xs font-bold text-text-muted">
                  <span>Độ khó: <strong class="text-accent-primary font-mono tabular-nums">${song.level || (levelNum + '/10')}</strong></span>
                  <span class="text-[9px] sm:text-xs font-semibold text-text-muted hidden sm:inline">Tuning: ${song.tuning || 'Standard'}</span>
                </div>
                <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
                  <div class="bg-warm-gradient h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
                </div>
              </div>

              <p class="text-[10px] sm:text-xs text-text-muted font-medium leading-snug pt-0.5 line-clamp-2">
                ${song.description || 'Fingerstyle nâng cao: nhiều đoạn hammer-on/pull-off tốc độ cao, thế tay dãn rộng và có slap kết hợp tỉa nốt.'}
              </p>
            </div>
          </div>

          <div class="pt-1 sm:pt-2">
            <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 font-extrabold text-[10px] sm:text-xs transition-all shadow-xs flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
              <span class="truncate">Mở Tab Đã Mua</span>
            </div>
          </div>
        </div>
      `
    }

    return `
      <div onclick="window.openCheckoutModal('${song.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer rounded-2xl sm:rounded-3xl border border-glass-border hover:border-amber-400 hover:shadow-xl transition-all w-full" data-id="${song.id}">
        <div class="space-y-2 sm:space-y-3">
          <!-- Thumbnail Visual (Warm Brown/Orange Gradient) -->
          <div class="relative overflow-hidden rounded-xl sm:rounded-2xl aspect-[4/3] sm:aspect-[16/10] bg-gradient-to-br from-[#9a4b24] via-[#7d3b19] to-[#54240d] p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out">
            <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
              <span class="bg-black/50 backdrop-blur px-1.5 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] font-mono">${song.category || 'NHẠC VIỆT'}</span>
              <div class="flex items-start gap-1 justify-end">
                ${userActionGroup}
                <div class="flex flex-col items-end gap-0.5 sm:gap-1">
                  <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-rose-600 text-white shadow-sm uppercase tracking-wide font-mono tabular-nums">BÁN • ${priceFormatted}</span>
                  ${discountNote ? `<span class="text-[7px] sm:text-[9px] text-white bg-accent-primary px-1.5 py-0.5 rounded-full font-extrabold shadow-xs inline-block leading-none whitespace-nowrap">${discountNote}</span>` : ''}
                </div>
              </div>
            </div>

            <!-- Center Play Demo Button -->
            <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.openVideoDemoModal('${escapeHtml(song.title)}', '${videoDemoUrl}')">
              <div class="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white text-[#9a4b24] flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <svg class="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 fill-current ml-0.5 text-accent-primary" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
              <span class="text-[8px] sm:text-[10px] font-bold mt-1 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap">Xem Video Demo</span>
            </div>

            <div class="flex justify-between items-end text-xs text-white/95 font-semibold">
              <span class="font-mono tabular-nums text-[9px] sm:text-[11px]">${song.duration || '03:40'}</span>
              <span class="text-white/80 text-[8px] sm:text-[11px]">Tuning: ${song.tuning || 'Standard'}</span>
            </div>
          </div>

          <!-- Details -->
          <div class="space-y-1">
            <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-tight line-clamp-1">
              ${song.title}
            </h3>

            <div class="space-y-0.5 sm:space-y-1 pt-0.5">
              <div class="flex items-center justify-between text-[10px] sm:text-xs font-bold text-text-muted">
                <span>Độ khó: <strong class="text-accent-primary font-mono tabular-nums">${song.level || (levelNum + '/10')}</strong></span>
                <span class="text-[9px] sm:text-xs font-semibold text-text-muted hidden sm:inline">Tuning: ${song.tuning || 'Standard'}</span>
              </div>
              <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
                <div class="bg-warm-gradient h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
              </div>
            </div>

            <p class="text-[10px] sm:text-xs text-text-muted font-medium leading-snug pt-0.5 line-clamp-2">
              ${song.description || 'Fingerstyle nâng cao: nhiều đoạn hammer-on/pull-off tốc độ cao, thế tay dãn rộng và có slap kết hợp tỉa nốt.'}
            </p>
          </div>
        </div>

        <div class="pt-1 sm:pt-2">
          <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-warm-gradient hover:brightness-105 text-white font-bold text-[10px] sm:text-xs transition-all shadow-md flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
            <span class="truncate">Nhận Video Tab</span>
          </div>
        </div>
      </div>
    `
  }).join('')
}

// ==========================================================================
// RENDER OVERVIEW GEARS (2-COLUMN ON MOBILE / MAX 4 INITIALLY WITH SEE MORE)
// ==========================================================================
async function renderOverviewGears() {
  if (!overviewGearsCarousel) return

  let gears = []
  try {
    gears = await fetchAllGears()
  } catch (e) {
    gears = DEFAULT_GEARS
  }
  if (!gears || gears.length === 0) gears = DEFAULT_GEARS

  const showMoreWrap = document.getElementById('overview-gears-show-more-wrap')
  const showMoreBtn = document.getElementById('overview-gears-show-more-btn')
  const showMoreText = document.getElementById('overview-gears-show-more-text')
  const showMoreIcon = document.getElementById('overview-gears-show-more-icon')

  overviewGearsCarousel.innerHTML = gears.map((gear, idx) => {
    const buyButtonHtml = gear.buy_url || gear.buyUrl
      ? `<a href="${gear.buy_url || gear.buyUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-accent-primary hover:underline">
          <span>${gear.buy_text || gear.buyText || 'Mua trên Shopee'}</span>
          <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </a>`
      : `<div class="text-[11px] sm:text-xs font-bold text-accent-primary italic">${gear.footer_text || gear.footerText ? `"${(gear.footer_text || gear.footerText).replace(/"/g, '')}"` : ''}</div>`

    const cleanDesc = (gear.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
    const cleanTitle = (gear.title || gear.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
    const imagePath = gear.image ? (gear.image.startsWith('/') ? gear.image : '/' + gear.image) : '/assets/clover.jpg'
    const extraClass = idx >= 4 ? 'gear-card-extra hidden md:flex' : ''

    return `
      <div class="w-full glass-card card-interactive rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-md flex flex-col justify-between gap-2.5 sm:gap-3.5 group md:w-[230px] lg:w-[245px] xl:w-[235px] md:max-w-none text-left border border-glass-border ${extraClass}">
        <div class="space-y-2 sm:space-y-3">
          <!-- Khung ảnh vuông 1:1 -->
          <div onclick="window.openImageModal('${imagePath}', '${cleanTitle}', '${cleanDesc}')" class="w-full aspect-square rounded-xl sm:rounded-2xl bg-white/95 dark:bg-white/[0.06] flex items-center justify-center p-2.5 sm:p-3.5 border border-glass-border shadow-inner overflow-hidden group/img relative cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-300" title="Click để phóng to ảnh">
            <img src="${imagePath}" alt="${cleanTitle}" class="w-full h-full object-contain filter drop-shadow-xs transition-transform duration-300 group-hover/img:scale-105" onerror="this.src='/assets/clover.jpg'" />
            <div class="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 p-1 sm:p-1.5 rounded-lg bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm shadow-sm pointer-events-none">
              <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
            </div>
          </div>
          <div>
            <span class="text-[9px] sm:text-[10px] font-extrabold font-mono tracking-widest text-accent-primary uppercase block">${gear.category || 'THIẾT BỊ'}</span>
            <h4 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-snug line-clamp-1">${gear.title || gear.name}</h4>
            <p class="text-[11px] sm:text-xs text-text-muted font-medium leading-snug mt-0.5 sm:mt-1 line-clamp-2 sm:line-clamp-3">${gear.description || ''}</p>
          </div>
        </div>
        <div class="pt-1.5 sm:pt-2 border-t border-glass-border">
          ${buyButtonHtml}
        </div>
      </div>
    `
  }).join('')

  // Configure Show More Button on Mobile
  if (showMoreWrap && showMoreBtn && gears.length > 4) {
    showMoreWrap.classList.remove('hidden')
    let isExpanded = false
    const extraCount = gears.length - 4

    showMoreText.textContent = `Xem thêm (${extraCount} món đồ khác)`

    showMoreBtn.onclick = () => {
      isExpanded = !isExpanded
      const extraCards = overviewGearsCarousel.querySelectorAll('.gear-card-extra')
      extraCards.forEach(card => {
        if (isExpanded) {
          card.classList.remove('hidden')
        } else {
          card.classList.add('hidden')
        }
      })

      if (isExpanded) {
        showMoreText.textContent = 'Thu gọn'
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

// ==========================================================================
// FAQ INTERACTIONS (CATEGORIES & EXPAND/COLLAPSE ALL)
// ==========================================================================
export function initFaq() {
  const faqItems = Array.from(document.querySelectorAll('#faq .faq-item'))
  const filterBtns = document.querySelectorAll('[data-faq-filter]')
  const showMoreWrap = document.getElementById('faq-show-more-wrap')
  const showMoreBtn = document.getElementById('faq-show-more-btn')
  const showMoreText = document.getElementById('faq-show-more-text')
  const showMoreIcon = document.getElementById('faq-show-more-icon')

  if (!faqItems.length) return

  let currentCategory = 'all'
  let isShowMore = false
  const INITIAL_LIMIT = 2

  function updateFaqDisplay() {
    const matchingItems = faqItems.filter(item => {
      const itemCat = item.getAttribute('data-category')
      return currentCategory === 'all' || itemCat === currentCategory
    })

    const totalMatching = matchingItems.length
    const visibleCount = isShowMore ? totalMatching : Math.min(INITIAL_LIMIT, totalMatching)

    faqItems.forEach(item => {
      item.classList.add('hidden')
    })

    matchingItems.slice(0, visibleCount).forEach(item => {
      item.classList.remove('hidden')
    })

    // Cập nhật nút Xem thêm / Thu gọn bớt
    if (showMoreWrap && showMoreBtn && showMoreText) {
      if (totalMatching > INITIAL_LIMIT) {
        showMoreWrap.classList.remove('hidden')
        if (isShowMore) {
          showMoreText.textContent = 'Thu gọn bớt'
          if (showMoreIcon) showMoreIcon.classList.add('rotate-180')
        } else {
          const remaining = totalMatching - INITIAL_LIMIT
          showMoreText.textContent = `Xem thêm ${remaining} câu hỏi`
          if (showMoreIcon) showMoreIcon.classList.remove('rotate-180')
        }
      } else {
        showMoreWrap.classList.add('hidden')
      }
    }
  }

  // Lọc theo chủ đề
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      currentCategory = btn.getAttribute('data-faq-filter') || 'all'
      isShowMore = false
      updateFaqDisplay()
    })
  })

  // Nút xem thêm
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      isShowMore = !isShowMore
      updateFaqDisplay()
    })
  }

  // Khởi chạy lần đầu
  updateFaqDisplay()
}

// ==========================================================================
// MODAL CONTROLS & GLOBAL ACTION HANDLERS (EXACTLY MATCHING GUEST LANDING PAGE)
// ==========================================================================

let activeCheckoutSyntax = ''

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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

window.openMaterialModal = function openMaterialModal(song) {
  if (!song) return
  const modal = document.getElementById('material-modal')
  const titleEl = document.getElementById('material-modal-title')
  const metaEl = document.getElementById('material-modal-meta')
  const linkEl = document.getElementById('material-download-link')

  if (titleEl) titleEl.textContent = song.title
  if (metaEl) metaEl.textContent = `${song.singer || 'Various Artists'} • ${song.category || 'Fingerstyle'} • ${song.level || 'Cơ bản'}`
  if (linkEl) {
    linkEl.href = song.drive_url || song.target_url || song.targetUrl || '#'
  }

  toggleModal('material-modal', true)
}

window.navigateToPurchasesTab = function(songId) {
  window.location.hash = 'purchases'
  setActiveTab('purchases')

  const song = allSongs.find(s => String(s.id) === String(songId))
  const songTitle = song?.title ? `"${song.title}"` : ''
  
  showToast(songTitle ? `Đã chuyển sang Tab Đã Mua bài ${songTitle} 🎸` : 'Đã chuyển sang mục Tab Đã Mua 🎸', 'success')
  
  // Smooth scroll up to tab bar / purchases section
  setTimeout(() => {
    const targetElement = document.getElementById('section-purchases') || document.getElementById('dashboard-tab-bar')
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    
    if (songId) {
      setTimeout(() => {
        const card = document.querySelector(`[data-song-id="${songId}"]`)
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' })
          card.classList.add('ring-4', 'ring-accent-primary', 'shadow-2xl')
          setTimeout(() => card.classList.remove('ring-4', 'ring-accent-primary', 'shadow-2xl'), 3000)
        }
      }, 250)
    }
  }, 50)
}

window.openCheckoutModal = function openCheckoutModal(tabId) {
  const tab = allSongs.find(t => String(t.id) === String(tabId))
  if (!tab) return

  // If user already bought this song, switch directly to purchases tab
  if (purchasedSongIds.has(String(tab.id))) {
    window.navigateToPurchasesTab(tab.id)
    return
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
  if (priceEl) priceEl.textContent = tab.price_formatted || tab.price || '239.000 VNĐ'

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

  const videoDemo = tab.video_demo_url || tab.video_demo || tab.videoDemo || ''
  if (videoEl && videoSrcEl && videoContainer) {
    if (videoDemo) {
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

window.openFreeTabModal = function openFreeTabModal(tabId) {
  const tab = allSongs.find(t => String(t.id) === String(tabId))
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

  const videoUrl = tab.target_url || tab.targetUrl || tab.video_demo_url || tab.video_demo || tab.videoDemo || ''
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
  } else if (tab.video_demo && localVideoEl) {
    const cleanVideo = tab.video_demo.startsWith('/') ? tab.video_demo : '/' + tab.video_demo
    localVideoEl.src = cleanVideo
    localVideoEl.classList.remove('hidden')
    if (iframeEl) iframeEl.classList.add('hidden')
  } else if (iframeEl) {
    iframeEl.src = ''
    iframeEl.classList.add('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
  }

  if (backupLinkEl) backupLinkEl.href = videoUrl || '#'

  if (pdfBtn) {
    const pdfUrl = tab.pdf_url || tab.pdfUrl || tab.drive_url
    if (pdfUrl) {
      pdfBtn.removeAttribute('disabled')
      pdfBtn.href = pdfUrl
      pdfBtn.target = '_blank'
      pdfBtn.className = 'w-full py-3 rounded-2xl bg-warm-gradient hover:brightness-105 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 text-center cursor-pointer active:scale-95'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 fill-none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Tải file PDF Tab</span>
      `
    } else {
      pdfBtn.setAttribute('disabled', 'true')
      pdfBtn.removeAttribute('href')
      pdfBtn.className = 'w-full py-3 rounded-2xl bg-glass-bg/40 border border-glass-border/50 text-text-faint font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 text-center cursor-not-allowed opacity-60 pointer-events-none'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Tải file PDF (Đang cập nhật)</span>
      `
    }
  }

  toggleModal('free-tab-modal', true)
}

window.openVideoDemoModal = function openVideoDemoModal(title, videoSrc) {
  if (!title || !videoSrc) return
  let cleanSrc = videoSrc
  if (cleanSrc && !cleanSrc.startsWith('/') && !cleanSrc.startsWith('http')) {
    cleanSrc = '/' + cleanSrc
  }
  const titleEl = document.getElementById('video-demo-title')
  const videoEl = document.getElementById('demo-modal-video')
  if (titleEl) titleEl.textContent = title
  if (videoEl) {
    videoEl.src = cleanSrc
    videoEl.currentTime = 0
    videoEl.load()
    videoEl.play().catch(e => console.warn('Auto play demo video error:', e))
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

window.toggleFavoriteSong = async function(event, songId) {
  if (event) event.stopPropagation()
  if (!currentUser) return

  const sId = String(songId)
  const isFav = favoriteSongIds.has(sId)

  try {
    if (isFav) {
      const { error } = await supabase.from('favorites').delete().match({ user_id: currentUser.id, song_id: sId })
      if (error) throw error
      favoriteSongIds.delete(sId)
      showToast('Đã bỏ yêu thích bài hát!')
    } else {
      const { error } = await supabase.from('favorites').insert({ user_id: currentUser.id, song_id: sId })
      if (error) throw error
      favoriteSongIds.add(sId)
      showToast('❤️ Đã thêm vào danh sách yêu thích!')
    }

    // Initial renders
    updateUserInfoUI()
    updateCounters()
    renderOverviewFeatured()
    renderOverviewGears()
    renderFavorites()
    renderPurchases()
  } catch (err) {
    console.error('Toggle favorite error:', err)
    showToast('Lỗi khi cập nhật yêu thích: ' + err.message, 'error')
  }
}

// Modal Event Listeners
document.getElementById('close-checkout-modal')?.addEventListener('click', () => toggleModal('checkout-modal', false))
document.getElementById('close-free-tab-modal')?.addEventListener('click', () => toggleModal('free-tab-modal', false))
document.getElementById('close-video-demo-modal')?.addEventListener('click', () => toggleModal('video-demo-modal', false))
document.getElementById('close-image-modal')?.addEventListener('click', () => toggleModal('image-preview-modal', false))
document.getElementById('close-material-modal')?.addEventListener('click', () => toggleModal('material-modal', false))
document.getElementById('close-material-btn')?.addEventListener('click', () => toggleModal('material-modal', false))

// Copy STK
document.getElementById('copy-stk-btn')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('03970202801')
    showToast('Đã sao chép số tài khoản TpBank: 03970202801 📋')
  } catch (e) {
    showToast('Không thể sao chép tự động.')
  }
})

// Copy Syntax
document.getElementById('copy-syntax-btn')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(activeCheckoutSyntax || 'VIDEOTAB TAB')
    showToast(`Đã sao chép cú pháp: ${activeCheckoutSyntax} 📋`)
  } catch (e) {
    showToast('Không thể sao chép tự động.')
  }
})

// Social Share
document.getElementById('share-zalo-btn')?.addEventListener('click', () => {
  const url = encodeURIComponent(window.location.href)
  window.open(`https://sp.zalo.me/share_inline?link=${url}`, '_blank')
})

document.getElementById('share-fb-btn')?.addEventListener('click', () => {
  const url = encodeURIComponent(window.location.href)
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank')
})

// Modal backdrop clicks
;['checkout-modal', 'free-tab-modal', 'video-demo-modal', 'image-preview-modal', 'material-modal'].forEach(id => {
  const modal = document.getElementById(id)
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) toggleModal(id, false)
    })
  }
})

// Escape key to close all modals
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ;['checkout-modal', 'free-tab-modal', 'video-demo-modal', 'image-preview-modal', 'material-modal'].forEach(id => {
      toggleModal(id, false)
    })
  }
})

// ==========================================================================
// RENDER FAVORITES TAB
// ==========================================================================
function renderFavorites() {
  if (!favoritesGrid) return

  const favSongs = allSongs.filter(s => favoriteSongIds.has(String(s.id)))
  
  // Filter
  let filtered = favSongs
  if (favFilter === 'free') {
    filtered = filtered.filter(s => s.is_free)
  } else if (favFilter === 'paid') {
    filtered = filtered.filter(s => !s.is_free)
  }

  // Search
  const query = favSearchQuery.toLowerCase().trim()
  if (query) {
    filtered = filtered.filter(s => s?.title?.toLowerCase().includes(query) || s?.singer?.toLowerCase().includes(query))
  }

  if (filtered.length === 0) {
    favoritesGrid.innerHTML = `
      <div class="col-span-full p-12 text-center glass-card rounded-3xl border border-glass-border space-y-3">
        <span class="text-4xl block">💔</span>
        <h3 class="text-base font-bold text-text-primary">Chưa có bài hát yêu thích nào</h3>
        <p class="text-xs text-text-muted max-w-sm mx-auto">
          Dạo qua Kho Video Tab và bấm biểu tượng trái tim ❤️ để lưu các bài hát bạn muốn tập vào đây nhé!
        </p>
        <a href="/kho-tab.html" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-warm-gradient text-white font-bold text-xs shadow-glow hover:brightness-105 transition-all mt-2">
          <span>Khám Phá Kho Tab</span>
          <span>→</span>
        </a>
      </div>
    `
    return
  }

  favoritesGrid.innerHTML = filtered.map(song => {
    const isBought = purchasedSongIds.has(String(song.id))
    return `
      <div class="glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-glass-border hover:border-amber-400/60 hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden" data-song-id="${song.id}">
        <div>
          <div class="flex items-center justify-between gap-1 sm:gap-2 mb-2 sm:mb-3">
            <span class="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${
              song?.level === 'Dễ' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
              song?.level === 'Trung bình' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
              'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }">${song?.level || 'Cơ bản'}</span>
            
            <button class="btn-remove-fav p-1 sm:p-1.5 rounded-full text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer" data-id="${song?.id}" title="Bỏ lưu khỏi mục yêu thích">
              <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
          </div>

          <h3 class="text-xs sm:text-base font-extrabold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">${song?.title || 'Chưa có tên'}</h3>
          <p class="text-[10px] sm:text-xs text-text-muted font-medium mb-2 sm:mb-3 truncate">${song?.singer || 'Various Artists'} • <span class="font-mono">${song?.category || 'Fingerstyle'}</span></p>

          <div class="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] bg-black/5 dark:bg-white/5 p-2 sm:p-2.5 rounded-xl border border-glass-border mb-3 sm:mb-4 font-mono">
            <div><span class="text-text-muted block text-[9px] sm:text-[10px]">Capo:</span><strong class="text-text-primary truncate block">${song?.capo ?? 'Không kẹp'}</strong></div>
            <div><span class="text-text-muted block text-[9px] sm:text-[10px]">Tuning:</span><strong class="text-text-primary truncate block">${song?.tuning || 'Standard'}</strong></div>
          </div>
        </div>

        <div class="pt-2 sm:pt-3 border-t border-glass-border flex items-center justify-between gap-1.5 sm:gap-2">
          <button class="btn-demo-view flex-1 py-1.5 sm:py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover text-[10px] sm:text-xs font-bold text-text-primary border border-glass-border transition-colors cursor-pointer" data-id="${song.id}">
            🎬 Demo
          </button>
          ${isBought || song.is_free ? `
            <button class="btn-open-material flex-1 py-1.5 sm:py-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] sm:text-xs font-bold transition-colors cursor-pointer" data-id="${song.id}">
              📂 Xem Tab
            </button>
          ` : `
            <a href="/kho-tab.html" class="flex-1 py-1.5 sm:py-2 rounded-xl bg-warm-gradient text-white text-[10px] sm:text-xs font-bold text-center shadow-xs hover:brightness-105 transition-all">
              Mua Tab
            </a>
          `}
        </div>
      </div>
    `
  }).join('')

  attachSongCardEvents(favoritesGrid)
}

// ==========================================================================
// RENDER PURCHASES TAB
// ==========================================================================
function renderPurchases() {
  if (!purchasesGrid) return

  const boughtSongs = allSongs.filter(s => purchasedSongIds.has(String(s.id)))
  
  // Filter
  let filtered = boughtSongs
  if (purchasedFilter === 'free') {
    filtered = filtered.filter(s => s.is_free)
  } else if (purchasedFilter === 'paid') {
    filtered = filtered.filter(s => !s.is_free)
  }

  // Search
  const query = purchasedSearchQuery.toLowerCase().trim()
  if (query) {
    filtered = filtered.filter(s => s?.title?.toLowerCase().includes(query) || s?.singer?.toLowerCase().includes(query))
  }

  if (filtered.length === 0) {
    purchasesGrid.innerHTML = `
      <div class="col-span-full p-12 text-center glass-card rounded-3xl border border-glass-border space-y-3">
        <span class="text-4xl block">📦</span>
        <h3 class="text-base font-bold text-text-primary">Chưa có bài hát đã mua nào</h3>
        <p class="text-xs text-text-muted max-w-sm mx-auto">
          Khi bạn sở hữu bản quyền Video Tab từ Quang, toàn bộ link tải chất lượng cao sẽ hiển thị vĩnh viễn tại đây mà không cần thanh toán lại!
        </p>
        <a href="/kho-tab.html" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-warm-gradient text-white font-bold text-xs shadow-glow hover:brightness-105 transition-all mt-2">
          <span>Khám Phá Video Tab Trả Phí</span>
          <span>→</span>
        </a>
      </div>
    `
    return
  }

  purchasesGrid.innerHTML = filtered.map(song => {
    return `
      <div class="glass-card rounded-2xl sm:rounded-3xl p-3 sm:p-5 border border-amber-500/40 hover:border-amber-400 hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden bg-gradient-to-b from-amber-500/5 to-transparent" data-song-id="${song.id}">
        <div>
          <div class="flex items-center justify-between gap-1 sm:gap-2 mb-2 sm:mb-3">
            <span class="px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black bg-emerald-600 text-white shadow-sm flex items-center gap-1 uppercase tracking-wide">
              <span>✓</span>
              <span>ĐÃ SỞ HỮU</span>
            </span>
            <span class="text-[9px] sm:text-[11px] font-mono font-bold text-text-muted">${song?.category || 'Fingerstyle'}</span>
          </div>

          <h3 class="text-xs sm:text-base font-extrabold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">${song?.title || 'Chưa có tên'}</h3>
          <p class="text-[10px] sm:text-xs text-text-muted font-medium mb-2 sm:mb-3 truncate">${song?.singer || 'Various Artists'}</p>

          <div class="grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] bg-black/5 dark:bg-white/5 p-2 sm:p-2.5 rounded-xl border border-glass-border mb-3 sm:mb-4 font-mono">
            <div><span class="text-text-muted block text-[9px] sm:text-[10px]">Capo:</span><strong class="text-text-primary truncate block">${song?.capo ?? 'Không kẹp'}</strong></div>
            <div><span class="text-text-muted block text-[9px] sm:text-[10px]">Tempo:</span><strong class="text-text-primary truncate block">${song?.tempo ? song.tempo + ' BPM' : 'Tùy chỉnh'}</strong></div>
          </div>
        </div>

        <div class="pt-2 sm:pt-3 border-t border-glass-border flex items-center justify-between gap-1.5 sm:gap-2">
          <button class="btn-demo-view flex-1 py-1.5 sm:py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover text-[10px] sm:text-xs font-bold text-text-primary border border-glass-border transition-colors cursor-pointer" data-id="${song.id}">
            🎬 Demo
          </button>
          <button class="btn-open-material flex-1 py-1.5 sm:py-2 rounded-xl bg-warm-gradient text-white text-[10px] sm:text-xs font-extrabold shadow-glow hover:brightness-105 transition-all cursor-pointer flex items-center justify-center gap-1" data-id="${song.id}">
            <span>📂 Tải Tab</span>
          </button>
        </div>
      </div>
    `
  }).join('')

  attachSongCardEvents(purchasesGrid)
}

// ==========================================================================
// ATTACH SONG CARD BUTTON LISTENERS
// ==========================================================================
function attachSongCardEvents(container) {
  if (!container) return

  // Demo Button
  container.querySelectorAll('.btn-demo-view').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const song = allSongs.find(s => String(s.id) === String(id))
      if (song) {
        window.openVideoDemoModal(song.title, song.video_demo_url || song.video_demo || (`/assets/${song.id}demo.mp4`))
      }
    })
  })

  // Open Material / Download Button
  container.querySelectorAll('.btn-open-material').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const song = allSongs.find(s => String(s.id) === String(id))
      if (song) openMaterialModal(song)
    })
  })

  // Remove Favorite Button
  container.querySelectorAll('.btn-remove-fav').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = String(btn.dataset.id)
      
      try {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .match({ user_id: currentUser.id, song_id: id })

        if (error) throw error

        favoriteSongIds.delete(id)
        updateCounters()
        renderFavorites()
        renderOverviewFeatured()
        showToast('Đã xóa bài hát khỏi danh sách yêu thích!')
      } catch (err) {
        console.error('Error removing favorite:', err)
        showToast('Không thể bỏ yêu thích bài hát. Vui lòng thử lại!', 'error')
      }
    })
  })
}

// Search Inputs Handlers
searchFavInput?.addEventListener('input', (e) => {
  favSearchQuery = e.target.value
  renderFavorites()
})

filterFavSelect?.addEventListener('change', (e) => {
  favFilter = e.target.value
  renderFavorites()
})

searchPurchasedInput?.addEventListener('input', (e) => {
  purchasedSearchQuery = e.target.value
  renderPurchases()
})

filterPurchasedSelect?.addEventListener('change', (e) => {
  purchasedFilter = e.target.value
  renderPurchases()
})



// ==========================================================================
// PROFILE UPDATE FORM HANDLER
// ==========================================================================
if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const fullName = profileNameInput?.value?.trim()
    const avatarUrl = profileAvatarInput?.value?.trim()

    if (!fullName) {
      showToast('Vui lòng nhập họ và tên của bạn!', 'error')
      return
    }

    if (saveProfileBtn) {
      saveProfileBtn.disabled = true
      saveProfileBtn.textContent = 'Đang lưu...'
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: currentUser.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          role: currentProfile?.role || 'user'
        })

      if (error) throw error

      currentProfile.full_name = fullName
      currentProfile.avatar_url = avatarUrl

      updateUserInfoUI()
      showToast('Cập nhật hồ sơ cá nhân thành công!')
    } catch (err) {
      console.error('Profile update error:', err)
      showToast(`Lỗi cập nhật hồ sơ: ${err.message}`, 'error')
    } finally {
      if (saveProfileBtn) {
        saveProfileBtn.disabled = false
        saveProfileBtn.textContent = 'Lưu Thay Đổi Hồ Sơ'
      }
    }
  })
}

// ==========================================================================
// CHANGE PASSWORD FORM HANDLER (RE-AUTHENTICATION + UPDATE)
// ==========================================================================
function showPasswordAlert(msg, isSuccess = false) {
  if (!passwordAlert || !passwordAlertText) return
  passwordAlert.classList.remove('hidden')
  passwordAlertText.textContent = msg

  if (isSuccess) {
    passwordAlert.className = 'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
  } else {
    passwordAlert.className = 'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
  }
}

function hidePasswordAlert() {
  if (passwordAlert) passwordAlert.classList.add('hidden')
}

if (changePasswordForm) {
  changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    hidePasswordAlert()

    const currentPassword = currentPasswordInput?.value
    const newPassword = newPasswordInput?.value
    const confirmPassword = confirmNewPasswordInput?.value

    if (!currentPassword || !newPassword || !confirmPassword) {
      showPasswordAlert('Vui lòng điền đầy đủ tất cả các trường mật khẩu.')
      return
    }

    if (newPassword.length < 6) {
      showPasswordAlert('Mật khẩu mới phải có tối thiểu 6 ký tự.')
      return
    }

    if (newPassword !== confirmPassword) {
      showPasswordAlert('Xác nhận mật khẩu mới không trùng khớp.')
      return
    }

    if (newPassword === currentPassword) {
      showPasswordAlert('Mật khẩu mới phải khác với mật khẩu hiện tại.')
      return
    }

    if (changePasswordBtn) {
      changePasswordBtn.disabled = true
      if (pwdBtnText) pwdBtnText.textContent = 'Đang xác thực và đổi...'
      if (pwdBtnSpinner) pwdBtnSpinner.classList.remove('hidden')
    }

    try {
      // Step 1: Re-authenticate to verify old password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      })

      if (signInError) {
        showPasswordAlert('Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại!')
        return
      }

      // Step 2: Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (updateError) throw updateError

      showPasswordAlert('Đổi mật khẩu thành công!', true)
      showToast('Đổi mật khẩu thành công!')
      changePasswordForm.reset()
    } catch (err) {
      console.error('Password change error:', err)
      showPasswordAlert(`Lỗi đổi mật khẩu: ${err.message}`)
    } finally {
      if (changePasswordBtn) {
        changePasswordBtn.disabled = false
        if (pwdBtnText) pwdBtnText.textContent = 'Cập Nhật Mật Khẩu Mới'
        if (pwdBtnSpinner) pwdBtnSpinner.classList.add('hidden')
      }
    }
  })
}

// Initial Boot
document.addEventListener('DOMContentLoaded', checkAuthAndInit)
