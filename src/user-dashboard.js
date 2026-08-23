/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — USER DASHBOARD CONTROLLER (user-dashboard.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initNavbarShrink, initMobileMenu } from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs } from './lib/songs-service.js'


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

const navTabOverview = document.getElementById('nav-tab-overview')
const navTabFavorites = document.getElementById('nav-tab-favorites')
const navTabPurchases = document.getElementById('nav-tab-purchases')
const navTabProfile = document.getElementById('nav-tab-profile')

const sectionOverview = document.getElementById('section-overview')
const sectionFavorites = document.getElementById('section-favorites')
const sectionPurchases = document.getElementById('section-purchases')
const sectionProfile = document.getElementById('section-profile')

const overviewFeaturedTabs = document.getElementById('overview-featured-tabs')
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
  
  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg

  toastNotification.className = `toast-${type} toast-visible`

  if (toastIcon) {
    if (type === 'error') {
      toastIcon.textContent = '✕'
      toastIcon.className = 'text-rose-500 font-bold'
    } else if (type === 'info') {
      toastIcon.textContent = '⟳'
      toastIcon.className = 'animate-spin text-amber-500'
    } else {
      toastIcon.textContent = '✓'
      toastIcon.className = 'text-emerald-500 font-bold'
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
    // Pause video if closing video modal
    const video = modal.querySelector('video')
    if (video) video.pause()
  }
}

function openDemoVideoModal(song) {
  const modalTitle = document.getElementById('modal-video-title')
  const videoPlayer = document.getElementById('demo-video-player')

  if (modalTitle) modalTitle.textContent = `Demo: ${song.title} - ${song.singer || 'Various Artists'}`
  
  let videoUrl = song.video_demo_url || song.video_demo || `/assets/${song.id}demo.mp4`
  if (videoUrl && !videoUrl.startsWith('/') && !videoUrl.startsWith('http')) {
    videoUrl = '/' + videoUrl;
  }
  
  if (videoPlayer) {
    videoPlayer.src = videoUrl
    videoPlayer.load()
    // Automatically play the video when modal opens
    const playPromise = videoPlayer.play()
    if (playPromise !== undefined) {
      playPromise.catch(error => console.log('Auto-play prevented:', error))
    }
  }

  toggleModal('video-demo-modal', true)
}

function openMaterialModal(song) {
  const title = document.getElementById('material-modal-title')
  const meta = document.getElementById('material-modal-meta')
  const link = document.getElementById('material-download-link')

  if (title) title.textContent = song.title
  if (meta) meta.textContent = `${song.singer || 'Various Artists'} • ${song.category || 'Fingerstyle'} • ${song.level || 'Cơ bản'}`
  if (link) {
    link.href = song.drive_url || '#'
    if (!song.drive_url) {
      link.onclick = (e) => {
        e.preventDefault()
        showToast('Tài liệu đang được cập nhật thêm, vui lòng liên hệ Zalo 0326.768.885!', 'info')
      }
    } else {
      link.onclick = null
    }
  }

  toggleModal('material-modal', true)
}

// Bind modal close buttons
document.getElementById('close-video-modal')?.addEventListener('click', () => toggleModal('video-demo-modal', false))
document.getElementById('close-video-modal-btn')?.addEventListener('click', () => toggleModal('video-demo-modal', false))
document.getElementById('close-material-modal')?.addEventListener('click', () => toggleModal('material-modal', false))
document.getElementById('close-material-btn')?.addEventListener('click', () => toggleModal('material-modal', false))

// Close modals on backdrop click
;['video-demo-modal', 'material-modal'].forEach(id => {
  const modal = document.getElementById(id)
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) toggleModal(id, false)
    })
  }
})

// ==========================================================================
// TAB SWITCHING LOGIC
// ==========================================================================
function setActiveTab(tab) {
  activeTab = tab
  const tabs = [
    { key: 'overview', btn: navTabOverview, sec: sectionOverview },
    { key: 'favorites', btn: navTabFavorites, sec: sectionFavorites },
    { key: 'purchases', btn: navTabPurchases, sec: sectionPurchases },
    { key: 'profile', btn: navTabProfile, sec: sectionProfile }
  ]

  tabs.forEach(t => {
    if (t.key === tab) {
      t.btn?.classList.remove('text-text-muted', 'hover:text-text-primary')
      t.btn?.classList.add('bg-warm-gradient', 'text-white', 'shadow-md')
      t.sec?.classList.remove('hidden')
    } else {
      t.btn?.classList.remove('bg-warm-gradient', 'text-white', 'shadow-md')
      t.btn?.classList.add('text-text-muted', 'hover:text-text-primary')
      t.sec?.classList.add('hidden')
    }
  })

  // Render content accordingly
  if (tab === 'favorites') renderFavorites()
  if (tab === 'purchases') renderPurchases()
}

navTabOverview?.addEventListener('click', () => { window.location.hash = 'overview'; setActiveTab('overview') })
navTabFavorites?.addEventListener('click', () => { window.location.hash = 'favorites'; setActiveTab('favorites') })
navTabPurchases?.addEventListener('click', () => { window.location.hash = 'purchases'; setActiveTab('purchases') })
navTabProfile?.addEventListener('click', () => { window.location.hash = 'profile'; setActiveTab('profile') })

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

    // Check URL Hash for initial tab
    const hash = window.location.hash.replace('#', '')
    if (['favorites', 'purchases', 'profile'].includes(hash)) {
      setActiveTab(hash)
    } else {
      setActiveTab('overview')
    }

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
// RENDER OVERVIEW FEATURED TABS
// ==========================================================================
function renderOverviewFeatured() {
  if (!overviewFeaturedTabs) return
  const featured = allSongs.slice(0, 3)

  if (featured.length === 0) {
    overviewFeaturedTabs.innerHTML = '<div class="p-6 text-center text-text-muted text-xs col-span-full">Chưa có bài hát nào trong kho.</div>'
    return
  }

  overviewFeaturedTabs.innerHTML = featured.map(song => {
    const isFav = favoriteSongIds.has(String(song.id))
    const isBought = purchasedSongIds.has(String(song.id))

    return `
      <div class="glass-card rounded-2xl p-4 border border-glass-border hover:border-amber-400/50 hover:shadow-xl transition-all flex flex-col justify-between group">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              song?.level === 'Dễ' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
              song?.level === 'Trung bình' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
              'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }">${song?.level || 'Cơ bản'}</span>
            <span class="text-[11px] font-mono font-bold text-text-muted">${song?.category || 'Fingerstyle'}</span>
          </div>
          <h4 class="text-sm font-extrabold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">${song?.title || 'Chưa có tên'}</h4>
          <p class="text-xs text-text-muted font-medium mb-3">${song?.singer || 'Various Artists'}</p>
        </div>
        <div class="pt-3 border-t border-glass-border flex items-center justify-between gap-2">
          <button class="btn-demo-view px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover text-xs font-bold text-text-primary border border-glass-border transition-colors cursor-pointer" data-id="${song.id}">
            🎬 Xem Demo
          </button>
          ${isBought || song.is_free ? `
            <button class="btn-open-material px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer" data-id="${song.id}">
              📂 Xem Tab
            </button>
          ` : `
            <a href="/kho-tab.html" class="px-3 py-1.5 rounded-xl bg-warm-gradient text-white text-xs font-bold shadow-xs hover:brightness-105 transition-all">
              Nhận Tab
            </a>
          `}
        </div>
      </div>
    `
  }).join('')

  attachSongCardEvents(overviewFeaturedTabs)
}

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
      <div class="glass-card rounded-3xl p-5 border border-glass-border hover:border-amber-400/60 hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden" data-song-id="${song.id}">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
              song?.level === 'Dễ' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' :
              song?.level === 'Trung bình' ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30' :
              'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
            }">${song?.level || 'Cơ bản'}</span>
            
            <button class="btn-remove-fav p-1.5 rounded-full text-rose-500 hover:bg-rose-500/15 transition-colors cursor-pointer" data-id="${song?.id}" title="Bỏ lưu khỏi mục yêu thích">
              <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
          </div>

          <h3 class="text-base font-extrabold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">${song?.title || 'Chưa có tên'}</h3>
          <p class="text-xs text-text-muted font-medium mb-3">${song?.singer || 'Various Artists'} • <span class="font-mono">${song?.category || 'Fingerstyle'}</span></p>

          <div class="grid grid-cols-2 gap-2 text-[11px] bg-black/5 dark:bg-white/5 p-2.5 rounded-xl border border-glass-border mb-4 font-mono">
            <div><span class="text-text-muted block text-[10px]">Capo:</span><strong class="text-text-primary">${song?.capo ?? 'Không kẹp'}</strong></div>
            <div><span class="text-text-muted block text-[10px]">Tuning:</span><strong class="text-text-primary">${song?.tuning || 'Standard'}</strong></div>
          </div>
        </div>

        <div class="pt-3 border-t border-glass-border flex items-center justify-between gap-2">
          <button class="btn-demo-view flex-1 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover text-xs font-bold text-text-primary border border-glass-border transition-colors cursor-pointer" data-id="${song.id}">
            🎬 Demo
          </button>
          ${isBought || song.is_free ? `
            <button class="btn-open-material flex-1 py-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors cursor-pointer" data-id="${song.id}">
              📂 Xem Tab
            </button>
          ` : `
            <a href="/kho-tab.html" class="flex-1 py-2 rounded-xl bg-warm-gradient text-white text-xs font-bold text-center shadow-xs hover:brightness-105 transition-all">
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
      <div class="glass-card rounded-3xl p-5 border border-amber-500/40 hover:border-amber-400 hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden bg-gradient-to-b from-amber-500/5 to-transparent" data-song-id="${song.id}">
        <div>
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1">
              <span>💎</span>
              <span>Đã Sở Hữu</span>
            </span>
            <span class="text-[11px] font-mono font-bold text-text-muted">${song?.category || 'Fingerstyle'}</span>
          </div>

          <h3 class="text-base font-extrabold text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">${song?.title || 'Chưa có tên'}</h3>
          <p class="text-xs text-text-muted font-medium mb-3">${song?.singer || 'Various Artists'}</p>

          <div class="grid grid-cols-2 gap-2 text-[11px] bg-black/5 dark:bg-white/5 p-2.5 rounded-xl border border-glass-border mb-4 font-mono">
            <div><span class="text-text-muted block text-[10px]">Capo:</span><strong class="text-text-primary">${song?.capo ?? 'Không kẹp'}</strong></div>
            <div><span class="text-text-muted block text-[10px]">Tempo:</span><strong class="text-text-primary">${song?.tempo ? song.tempo + ' BPM' : 'Tùy chỉnh'}</strong></div>
          </div>
        </div>

        <div class="pt-3 border-t border-glass-border flex items-center justify-between gap-2">
          <button class="btn-demo-view flex-1 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover text-xs font-bold text-text-primary border border-glass-border transition-colors cursor-pointer" data-id="${song.id}">
            🎬 Xem Demo
          </button>
          <button class="btn-open-material flex-1 py-2 rounded-xl bg-warm-gradient text-white text-xs font-extrabold shadow-glow hover:brightness-105 transition-all cursor-pointer flex items-center justify-center gap-1" data-id="${song.id}">
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
      if (song) openDemoVideoModal(song)
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
