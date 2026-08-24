/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN DASHBOARD CMS (admin-dashboard.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles } from './common.js'
import { fetchAllSongs, saveSong, removeSong, reorderAllSongs, extractYoutubeId } from './lib/songs-service.js'
import { fetchAllGears, DEFAULT_GEARS, saveGear, removeGear, reorderAllGears } from './lib/gears-service.js'

// If redirected here with a recovery token, immediately move to admin-reset-password.html
if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
  window.location.replace('/admin-reset-password.html' + (window.location.hash || window.location.search))
}

initThemeToggle()
initPasswordToggles()

// ==========================================================================
// STATE
// ==========================================================================
let songsList = []
let gearsList = []
let usersList = []
let recentGrantsList = []
let currentAdminId = null

let activeTab = 'songs' // 'songs' | 'gears' | 'users' | 'grant'
let songSearchQuery = ''
let songCategoryFilter = 'all'
let songTypeFilter = 'all'

let userSearchQuery = ''
let userSortBy = 'newest'

// DOM Elements
const adminUserEmail = document.getElementById('admin-user-email')
const logoutBtn = document.getElementById('logout-btn')
const tabNavSongs = document.getElementById('tab-nav-songs')
const tabNavGears = document.getElementById('tab-nav-gears')
const tabNavUsers = document.getElementById('tab-nav-users')
const tabNavGrant = document.getElementById('tab-nav-grant')
const sectionSongs = document.getElementById('section-songs')
const sectionGears = document.getElementById('section-gears')
const sectionUsers = document.getElementById('section-users')
const sectionGrant = document.getElementById('section-grant')

// Songs DOM
const adminSongsTbody = document.getElementById('admin-songs-tbody')
const addSongBtn = document.getElementById('add-song-btn')
const songModal = document.getElementById('song-modal')
const closeSongModal = document.getElementById('close-song-modal')
const cancelSongModalBtn = document.getElementById('cancel-song-modal-btn')
const songForm = document.getElementById('song-form')
const songModalTitle = document.getElementById('song-modal-title')

// Stats DOM
const statTotalSongs = document.getElementById('stat-total-songs')
const statFreeSongs = document.getElementById('stat-free-songs')
const statPaidSongs = document.getElementById('stat-paid-songs')
const statFeaturedSongs = document.getElementById('stat-featured-songs')

// Gears DOM
const adminGearsTbody = document.getElementById('admin-gears-tbody')
const addGearBtn = document.getElementById('add-gear-btn')
const resetGearsBtn = document.getElementById('reset-gears-btn')
const gearModal = document.getElementById('gear-modal')
const closeGearModal = document.getElementById('close-gear-modal')
const cancelGearModalBtn = document.getElementById('cancel-gear-modal-btn')
const gearForm = document.getElementById('gear-form')
const gearModalTitle = document.getElementById('gear-modal-title')

// Codes DOM
const codesModal = document.getElementById('codes-modal')
const closeCodesModal = document.getElementById('close-codes-modal')
const codesModalTitle = document.getElementById('codes-modal-title')
const codesModalSongName = document.getElementById('codes-modal-song-name')
const generateCodeBtn = document.getElementById('generate-code-btn')
const codesTbody = document.getElementById('codes-tbody')

// Users DOM
const adminSearchUsers = document.getElementById('admin-search-users')
const adminSortUsers = document.getElementById('admin-sort-users')
const statTotalUsers = document.getElementById('stat-total-users')
const adminUsersTbody = document.getElementById('users-tbody')

// Grant / Orders DOM
const grantAccessForm = document.getElementById('grant-access-form')
const grantSongSelect = document.getElementById('grant-song-select')
const grantUserIdInput = document.getElementById('grant-user-id')
const paidSongsList = document.getElementById('paid-songs-list')
const statPaidSongsCount = document.getElementById('stat-paid-songs-count')
const recentGrantsTbody = document.getElementById('recent-grants-tbody')
const refreshHistoryBtn = document.getElementById('refresh-history-btn')

// Change Password DOM
const openChangePasswordBtn = document.getElementById('open-change-password-btn')
const changePasswordModal = document.getElementById('change-password-modal')
const closeChangePasswordModal = document.getElementById('close-change-password-modal')
const cancelChangePasswordBtn = document.getElementById('cancel-change-password-btn')
const changePasswordForm = document.getElementById('change-password-form')
const adminNewPassword = document.getElementById('admin-new-password')
const adminConfirmPassword = document.getElementById('admin-confirm-password')
const toggleNewPasswordVisibility = document.getElementById('toggle-new-password-visibility')
const toggleConfirmPasswordVisibility = document.getElementById('toggle-confirm-password-visibility')
const changePwdError = document.getElementById('change-pwd-error')
const changePwdErrorText = document.getElementById('change-pwd-error-text')
const savePasswordBtn = document.getElementById('save-password-btn')
const savePasswordText = document.getElementById('save-password-text')
const savePasswordSpinner = document.getElementById('save-password-spinner')

// Filters
const adminSearchSongs = document.getElementById('admin-search-songs')
const adminFilterCategory = document.getElementById('admin-filter-category')
const adminFilterType = document.getElementById('admin-filter-type')

// Toast Notification
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
let toastTimer = null

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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

function toggleModal(modalEl, show = true) {
  if (!modalEl) return
  const dialog = modalEl.querySelector('.modal-dialog')

  if (show) {
    modalEl.classList.remove('opacity-0', 'pointer-events-none')
    modalEl.classList.add('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.remove('scale-95')
      dialog.classList.add('scale-100')
    }
  } else {
    modalEl.classList.add('opacity-0', 'pointer-events-none')
    modalEl.classList.remove('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.add('scale-95')
      dialog.classList.remove('scale-100')
    }
  }
}

// ==========================================================================
// AUTH GUARD
// ==========================================================================

async function checkAuth() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !session.user) {
      window.location.replace('/admin-login.html')
      return false
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    if (!isAdmin) {
      await supabase.auth.signOut()
      window.location.replace('/admin-login.html')
      return false
    }

    currentAdminId = session.user.id

    if (adminUserEmail) {
      adminUserEmail.textContent = session.user.email || 'Admin'
    }
    return true
  } catch (err) {
    console.error('Auth verification error:', err)
    window.location.replace('/admin-login.html')
    return false
  }
}

// ==========================================================================
// SONGS MANAGEMENT
// ==========================================================================

async function loadSongs() {
  songsList = await fetchAllSongs()
  updateStats()
  renderSongsTable()
}

function updateStats() {
  if (!songsList) return

  const total = songsList.length
  const free = songsList.filter(s => s.is_free ?? s.isFree).length
  const paid = total - free
  const featured = songsList.filter(s => s.is_featured ?? s.isFeatured).length

  if (statTotalSongs) statTotalSongs.textContent = total
  if (statFreeSongs) statFreeSongs.textContent = free
  if (statPaidSongs) statPaidSongs.textContent = paid
  if (statFeaturedSongs) statFeaturedSongs.textContent = featured
}

function renderSongsTable() {
  if (!adminSongsTbody) return

  let filtered = [...songsList]

  // Filter Search
  if (songSearchQuery.trim()) {
    const q = songSearchQuery.toLowerCase().trim()
    filtered = filtered.filter(s => 
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.singer && s.singer.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q))
    )
  }

  // Filter Category
  if (songCategoryFilter !== 'all') {
    filtered = filtered.filter(s => (s.category || 'Fingerstyle').toLowerCase() === songCategoryFilter.toLowerCase())
  }

  // Filter Type (Free / Paid)
  if (songTypeFilter === 'free') {
    filtered = filtered.filter(s => s.is_free ?? s.isFree)
  } else if (songTypeFilter === 'paid') {
    filtered = filtered.filter(s => !(s.is_free ?? s.isFree))
  }

  if (filtered.length === 0) {
    adminSongsTbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-text-muted">
          Không tìm thấy bài hát nào phù hợp.
        </td>
      </tr>
    `
    return
  }

  adminSongsTbody.innerHTML = filtered.map((song, idx) => {
    const isFree = song.is_free ?? song.isFree ?? false
    const isFeatured = song.is_featured ?? song.isFeatured ?? false
    const level = song.level_num ?? song.levelNum ?? 5
    const priceDisplay = isFree ? 'FREE' : formatCompactPrice(song.price_formatted || song.priceFormatted || song.price)
    const priceText = isFree 
      ? '<span class="px-2.5 py-1 rounded-full badge-semantic-success font-bold font-mono text-xs">FREE</span>' 
      : `<span class="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400 text-xs">${priceDisplay}</span>`
    const currentOrder = song.order || (idx + 1)
    const isFirst = idx === 0
    const isLast = idx === filtered.length - 1

    return `
      <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors" data-id="${song.id}">
        <!-- Vị Trí & Di Chuyển -->
        <td data-label="Vị Trí & Thứ Tự" class="py-3 px-3 text-center">
          <div class="inline-flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border">
            <input 
              type="number" 
              min="1" 
              max="${songsList.length}" 
              value="${currentOrder}" 
              id="order-input-song-${song.id}" 
              onkeydown="if(event.key==='Enter') window.handleSaveSongPosition('${song.id}')"
              class="w-11 text-center py-1 bg-glass-bg border border-glass-border rounded-lg font-mono tabular-nums font-bold text-xs text-text-primary focus:border-accent-primary focus:outline-none shadow-xs" 
              title="Nhập số thứ tự vị trí mong muốn rồi bấm Lưu hoặc nhấn Enter"
            />
            <button 
              onclick="window.handleSaveSongPosition('${song.id}')" 
              class="px-2.5 py-1 rounded-lg bg-warm-gradient hover:brightness-105 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              title="Lưu vị trí mới: Bài này sẽ chèn vào vị trí trên, các bài khác tự động dời">
              Lưu
            </button>
            <div class="flex flex-col gap-0.5">
              <button 
                onclick="window.handleMoveSong('${song.id}', 'up')" 
                ${isFirst ? 'disabled class="p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'} 
                title="Di chuyển lên 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button 
                onclick="window.handleMoveSong('${song.id}', 'down')" 
                ${isLast ? 'disabled class="p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'} 
                title="Di chuyển xuống 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </td>

        <td data-label="Bài Hát" class="py-3.5 px-4 font-bold text-text-primary">
          <div class="flex flex-col text-right sm:text-left">
            <span class="text-sm font-extrabold">${song.title}</span>
            <span class="text-xs text-text-muted font-medium">${song.singer || 'Guitar By Quang'}</span>
          </div>
        </td>
        <td data-label="Thể Loại" class="py-3.5 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${song.category || 'Fingerstyle'}</span>
        </td>
        <td data-label="Độ Khó" class="py-3.5 px-3 font-mono tabular-nums font-bold text-accent-primary text-xs">${level}/10</td>
        <td data-label="Tuning / Capo" class="py-3.5 px-3 text-text-muted text-xs font-medium">
          ${song.tuning || 'Standard'} / C:${song.capo ?? 0}
        </td>
        <td data-label="Loại / Giá" class="py-3.5 px-3">${priceText}</td>
        <td data-label="Nổi Bật" class="py-3.5 px-3">
          ${isFeatured ? '<span class="badge-semantic-warning px-2 py-0.5 rounded-full font-bold text-xs">★ Ghim</span>' : '<span class="text-text-muted/40 text-xs">—</span>'}
        </td>
        <td data-label="Thao Tác" class="py-3.5 px-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <button onclick="window.editSong('${song.id}')" class="px-3 py-1.5 rounded-lg bg-glass-bg hover:bg-glass-bg-hover text-accent-primary font-bold text-xs border border-glass-border transition-colors cursor-pointer">
              Sửa
            </button>
            <button onclick="window.deleteSong('${song.id}', '${song.title.replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors cursor-pointer">
              Xóa
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')
}

// ==========================================================================
// SONG POSITION & REORDER HANDLERS
// ==========================================================================

window.handleSaveSongPosition = async function(songId) {
  const input = document.getElementById(`order-input-song-${songId}`)
  if (!input) return

  let targetPos = parseInt(input.value, 10)
  if (isNaN(targetPos) || targetPos < 1) targetPos = 1
  if (targetPos > songsList.length) targetPos = songsList.length

  const currentIdx = songsList.findIndex(s => String(s.id) === String(songId))
  if (currentIdx === -1) return

  if (targetPos === currentIdx + 1) {
    showToast(`Bài hát đang ở đúng vị trí ${targetPos}!`, 'info')
    return
  }

  // Array Shift Algorithm (Splice reorder)
  const list = [...songsList]
  const [movedSong] = list.splice(currentIdx, 1)
  list.splice(targetPos - 1, 0, movedSong)

  const orderedIds = list.map(s => s.id)
  showToast('Đang cập nhật vị trí...', 'info')
  
  const res = await reorderAllSongs(orderedIds)

  if (res.success) {
    showToast(`✓ Đã di chuyển "${movedSong.title}" về vị trí số ${targetPos}! Các bài khác đã tự động dời.`, 'success')
    await loadSongs()
  } else {
    showToast(`❌ Lỗi khi lưu vị trí: ${res.error}`, 'error')
  }
}

window.handleMoveSong = async function(songId, direction) {
  const currentIdx = songsList.findIndex(s => String(s.id) === String(songId))
  if (currentIdx === -1) return

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
  if (targetIdx < 0 || targetIdx >= songsList.length) return

  const list = [...songsList]
  const [movedSong] = list.splice(currentIdx, 1)
  list.splice(targetIdx, 0, movedSong)

  const orderedIds = list.map(s => s.id)
  const res = await reorderAllSongs(orderedIds)

  if (res.success) {
    showToast(`✓ Đã di chuyển "${movedSong.title}" ${direction === 'up' ? 'lên' : 'xuống'} vị trí ${targetIdx + 1}!`, 'success')
    await loadSongs()
  } else {
    showToast(`❌ Lỗi khi di chuyển bài hát: ${res.error}`, 'error')
  }
}

window.setSongModalType = function(type) {
  const typeInput = document.getElementById('song-type')
  const freeBtn = document.getElementById('tab-btn-free')
  const paidBtn = document.getElementById('tab-btn-paid')
  const freeFields = document.getElementById('fields-free-song')
  const paidFields = document.getElementById('fields-paid-song')

  if (typeInput) typeInput.value = type

  if (type === 'free') {
    if (freeBtn) {
      freeBtn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer bg-emerald-600 text-white shadow-xs'
    }
    if (paidBtn) {
      paidBtn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-text-muted hover:text-text-primary'
    }
    freeFields?.classList.remove('hidden')
    paidFields?.classList.add('hidden')
  } else {
    if (paidBtn) {
      paidBtn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer bg-rose-600 text-white shadow-xs'
    }
    if (freeBtn) {
      freeBtn.className = 'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-text-muted hover:text-text-primary'
    }
    freeFields?.classList.add('hidden')
    paidFields?.classList.remove('hidden')
  }
}

window.openAddSongModal = function(type = 'free') {
  if (!songForm) return
  songForm.reset()
  document.getElementById('song-id').value = ''
  window.setSongModalType(type)
  
  if (type === 'free') {
    document.getElementById('song-level').value = '5'
    document.getElementById('song-tuning').value = 'Standard'
    document.getElementById('song-capo').value = '0'
    document.getElementById('song-duration').value = '03:15'
    document.getElementById('song-thumbnail-bg').value = 'from-[#D8C4AC] to-[#647A6C]'
    if (songModalTitle) songModalTitle.textContent = '🎁 Thêm Tab Miễn Phí Mới (Free Tab)'
  } else {
    document.getElementById('song-level').value = '8'
    document.getElementById('song-tuning').value = 'Standard'
    document.getElementById('song-capo').value = '1'
    document.getElementById('song-duration').value = '03:40'
    document.getElementById('song-paid-price').value = '239k'
    document.getElementById('song-paid-discount').value = 'HSSV: 179k'
    document.getElementById('song-thumbnail-bg').value = 'from-[#C1602F] to-[#6E3B1F]'
    if (songModalTitle) songModalTitle.textContent = '💎 Thêm Video Tab Có Phí Mới (Mua Tab)'
  }
  toggleModal(songModal, true)
}

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

window.editSong = function(id) {
  const song = songsList.find(s => String(s.id) === String(id))
  if (!song) return

  const isSongFree = Boolean(song.is_free ?? song.isFree ?? (Number(song.price) === 0))
  const songType = isSongFree ? 'free' : 'paid'

  document.getElementById('song-id').value = song.id
  document.getElementById('song-title').value = song.title || ''
  document.getElementById('song-singer').value = song.singer || ''
  document.getElementById('song-category').value = song.category || 'Nhạc Việt'
  document.getElementById('song-level').value = song.level_num ?? song.levelNum ?? (isSongFree ? 5 : 8)
  document.getElementById('song-tuning').value = song.tuning || 'Standard'
  document.getElementById('song-capo').value = song.capo ?? (isSongFree ? 0 : 1)
  document.getElementById('song-duration').value = song.duration || (isSongFree ? '03:15' : '03:40')
  document.getElementById('song-description').value = song.description || ''
  document.getElementById('song-thumbnail-bg').value = song.thumbnail_bg || song.thumbnailBg || (isSongFree ? 'from-[#D8C4AC] to-[#647A6C]' : 'from-[#C1602F] to-[#6E3B1F]')
  document.getElementById('song-is-featured').checked = Boolean(song.is_featured ?? song.isFeatured)

  if (isSongFree) {
    const rawTarget = song.target_url || song.tab_url || (song.youtube_id?.length === 11 ? `https://youtu.be/${song.youtube_id}` : song.youtube_id) || song.video_demo || ''
    document.getElementById('song-free-target-url').value = rawTarget
    document.getElementById('song-free-pdf-url').value = song.pdf_url || song.pdfUrl || ''
  } else {
    document.getElementById('song-paid-price').value = song.price_formatted || song.priceFormatted || (song.price ? formatCompactPrice(song.price) : '239k')
    document.getElementById('song-paid-discount').value = song.discount_note || song.discountNote || 'HSSV: 179k'
    document.getElementById('song-paid-demo-url').value = song.demo_video_url || song.video_demo || song.videoDemo || (song.youtube_id?.length === 11 ? `https://youtu.be/${song.youtube_id}` : song.youtube_id) || ''
    document.getElementById('song-paid-drive-url').value = song.tab_url || song.target_url || song.targetUrl || song.tabUrl || ''
  }

  window.setSongModalType(songType)

  if (songModalTitle) {
    songModalTitle.textContent = `Sửa Bài Hát: ${song.title}`
  }
  toggleModal(songModal, true)
}

window.deleteSong = async function(id, title) {
  if (!confirm(`Bạn có chắc chắn muốn xóa bài hát "${title}"? Thao tác này không thể hoàn tác.`)) {
    return
  }

  try {
    await removeSong(id)
    showToast(`✓ Đã xóa thành công bài hát "${title}"!`, 'success')
    await loadSongs()
  } catch (err) {
    showToast(`❌ Lỗi khi xóa bài hát: ${err.message}`, 'error')
  }
}

if (songForm) {
  songForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const songId = document.getElementById('song-id').value.trim()
    const isEdit = Boolean(songId)
    const type = document.getElementById('song-type')?.value || 'free'
    const isFree = type === 'free'

    const titleVal = document.getElementById('song-title').value.trim()
    if (!titleVal) {
      showToast('❌ Vui lòng nhập Tên Bài Hát!', 'error')
      return
    }

    const singerVal = document.getElementById('song-singer').value.trim()
    const categoryVal = document.getElementById('song-category').value.trim() || 'Nhạc Việt'
    const levelVal = Number(document.getElementById('song-level').value) || (isFree ? 5 : 8)
    const tuningVal = document.getElementById('song-tuning').value.trim() || 'Standard'
    const capoVal = String(document.getElementById('song-capo').value ?? (isFree ? '0' : '1'))
    const durationVal = document.getElementById('song-duration').value.trim() || (isFree ? '03:15' : '03:40')
    const thumbnailBgVal = document.getElementById('song-thumbnail-bg').value || (isFree ? 'from-[#D8C4AC] to-[#647A6C]' : 'from-[#C1602F] to-[#6E3B1F]')
    const descriptionVal = document.getElementById('song-description').value.trim()
    const isFeatured = document.getElementById('song-is-featured').checked

    let payload = {}

    if (isFree) {
      const freeTargetUrl = document.getElementById('song-free-target-url').value.trim()
      const freePdfUrl = document.getElementById('song-free-pdf-url').value.trim()

      if (!freeTargetUrl) {
        showToast('❌ Vui lòng nhập Link Video Xem Tab (YouTube / TikTok / Google Drive)!', 'error')
        return
      }

      const ytId = extractYoutubeId(freeTargetUrl)

      payload = {
        title: titleVal,
        singer: singerVal || 'Guitar By Quang',
        category: categoryVal,
        level_num: levelVal,
        level: `${levelVal}/10`,
        tuning: tuningVal,
        capo: capoVal,
        duration: durationVal,
        description: descriptionVal || (singerVal ? `Ca sĩ / Tác giả: ${singerVal}. Bản tab miễn phí kèm video hướng dẫn từ Guitar By Quang.` : 'Bản tab guitar fingerstyle miễn phí kèm video hướng dẫn.'),
        is_free: true,
        price: 0,
        price_formatted: 'Miễn phí',
        priceFormatted: 'Miễn phí',
        discount_note: null,
        has_demo: Boolean(ytId || freeTargetUrl.endsWith('.mp4')),
        video_demo: ytId ? `https://youtu.be/${ytId}` : freeTargetUrl,
        demo_video_url: ytId ? `https://youtu.be/${ytId}` : freeTargetUrl,
        youtube_id: ytId || null,
        target_url: freeTargetUrl,
        tab_url: freeTargetUrl,
        pdf_url: freePdfUrl || null,
        thumbnail_bg: thumbnailBgVal,
        button_type: 'link',
        button_text: 'Link xem tab',
        is_featured: isFeatured
      }
    } else {
      const priceRaw = document.getElementById('song-paid-price').value.trim() || '239k'
      const priceFormatted = formatCompactPrice(priceRaw)
      const numericPrice = Number(priceRaw.replace(/[^0-9]/g, '')) || 239000
      const priceVal = numericPrice < 1000 && numericPrice > 0 ? numericPrice * 1000 : numericPrice
      const discountNoteVal = document.getElementById('song-paid-discount').value.trim() || 'HSSV: 179k'
      const demoUrlVal = document.getElementById('song-paid-demo-url').value.trim()
      const driveUrlVal = document.getElementById('song-paid-drive-url').value.trim()

      if (!demoUrlVal) {
        showToast('❌ Vui lòng nhập Link Video Demo xem trước (YouTube hoặc MP4)!', 'error')
        return
      }

      const ytId = extractYoutubeId(demoUrlVal)

      payload = {
        title: titleVal,
        singer: singerVal || 'Guitar By Quang',
        category: categoryVal,
        level_num: levelVal,
        level: `${levelVal}/10`,
        tuning: tuningVal,
        capo: capoVal,
        duration: durationVal,
        description: descriptionVal || (singerVal ? `Ca sĩ / Tác giả: ${singerVal}. Fingerstyle nâng cao kèm video chi tiết.` : 'Bản Video Tab độc quyền chất lượng cao từ Guitar By Quang.'),
        is_free: false,
        price: priceVal,
        price_formatted: priceFormatted,
        priceFormatted: priceFormatted,
        discount_note: discountNoteVal,
        has_demo: true,
        video_demo: ytId ? `https://youtu.be/${ytId}` : demoUrlVal,
        demo_video_url: ytId ? `https://youtu.be/${ytId}` : demoUrlVal,
        youtube_id: ytId || null,
        target_url: driveUrlVal || '',
        tab_url: driveUrlVal || '',
        pdf_url: null,
        thumbnail_bg: thumbnailBgVal,
        button_type: 'buy',
        button_text: 'Mua Video Tab',
        is_featured: isFeatured
      }
    }

    try {
      showToast('Đang lưu bài hát...', 'info')
      const res = await saveSong(payload, isEdit, songId)
      
      if (res.success) {
        showToast(isEdit ? `✓ Đã cập nhật thành công bài hát: "${titleVal}"!` : `✓ Đã thêm bài hát mới thành công: "${titleVal}"!`, 'success')
        toggleModal(songModal, false)
        await loadSongs()
      } else {
        showToast(`❌ Lưu thất bại: ${res.error || res.warning || 'Không thể lưu bài hát vào Supabase'}`, 'error')
      }
    } catch (err) {
      showToast(`❌ Lỗi khi lưu bài hát: ${err.message}`, 'error')
    }
  })
}

// ==========================================================================
// GEARS MANAGEMENT
// ==========================================================================

async function loadGears() {
  gearsList = await fetchAllGears()
  renderGearsTable()
}

function renderGearsTable() {
  if (!adminGearsTbody) return

  if (!gearsList || gearsList.length === 0) {
    adminGearsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-text-muted">
          Chưa có gear nào trong danh sách. Bấm "Nạp 4 Món Mẫu" để khởi tạo nhé!
        </td>
      </tr>
    `
    return
  }

  adminGearsTbody.innerHTML = gearsList.map((gear, idx) => {
    const currentOrder = gear.order || (idx + 1)
    const isFirst = idx === 0
    const isLast = idx === gearsList.length - 1
    const name = gear.name || gear.title || 'Món đồ nghề'
    const image = gear.image_url || gear.image || '/assets/avatar.jpg'
    const category = gear.category || 'Phụ kiện'
    const price = gear.footer_text || gear.price || 'Liên hệ'
    const description = gear.description || 'Chưa có mô tả'

    return `
      <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors" data-id="${gear.id}">
        <!-- Vị Trí & Di Chuyển -->
        <td data-label="Vị Trí" class="py-3 px-3 text-center">
          <div class="inline-flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border">
            <input 
              type="number" 
              min="1" 
              max="${gearsList.length}" 
              value="${currentOrder}" 
              id="order-input-gear-${gear.id}" 
              onkeydown="if(event.key==='Enter') window.handleSaveGearPosition('${gear.id}')"
              class="w-11 text-center py-1 bg-glass-bg border border-glass-border rounded-lg font-mono tabular-nums font-bold text-xs text-text-primary focus:border-accent-primary focus:outline-none shadow-xs" 
              title="Nhập số thứ tự vị trí mong muốn rồi bấm Lưu hoặc nhấn Enter"
            />
            <button 
              onclick="window.handleSaveGearPosition('${gear.id}')" 
              class="px-2.5 py-1 rounded-lg bg-warm-gradient hover:brightness-105 text-white font-bold text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              title="Lưu vị trí mới">
              Lưu
            </button>
            <div class="flex flex-col gap-0.5">
              <button 
                onclick="window.handleMoveGear('${gear.id}', 'up')" 
                ${isFirst ? 'disabled class="p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'} 
                title="Di chuyển lên 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button 
                onclick="window.handleMoveGear('${gear.id}', 'down')" 
                ${isLast ? 'disabled class="p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'} 
                title="Di chuyển xuống 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </td>

        <td data-label="Ảnh & Tên Thiết Bị" class="py-3.5 px-4 font-bold text-text-primary">
          <div class="flex items-center gap-3 justify-end sm:justify-start">
            <img src="${image}" alt="${name}" class="w-10 h-10 rounded-xl object-cover bg-black/5 border border-glass-border flex-shrink-0" onerror="this.src='/assets/avatar.jpg'" />
            <span class="text-sm font-extrabold">${name}</span>
          </div>
        </td>
        <td data-label="Phân Loại" class="py-3.5 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${category}</span>
        </td>
        <td data-label="Mô Tả Ngắn" class="py-3.5 px-3 text-text-muted text-xs font-medium max-w-xs truncate">${description}</td>
        <td data-label="Giá Hiển Thị" class="py-3.5 px-3 font-mono tabular-nums font-bold text-text-primary text-xs">${price}</td>
        <td data-label="Thao Tác" class="py-3.5 px-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <button onclick="window.editGear('${gear.id}')" class="px-3 py-1.5 rounded-lg bg-glass-bg hover:bg-glass-bg-hover text-accent-primary font-bold text-xs border border-glass-border transition-colors cursor-pointer">
              Sửa
            </button>
            <button onclick="window.deleteGear('${gear.id}', '${name.replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors cursor-pointer">
              Xóa
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')
}

// ==========================================================================
// GEAR POSITION & REORDER HANDLERS
// ==========================================================================

window.handleSaveGearPosition = async function(gearId) {
  const input = document.getElementById(`order-input-gear-${gearId}`)
  if (!input) return

  let targetPos = parseInt(input.value, 10)
  if (isNaN(targetPos) || targetPos < 1) targetPos = 1
  if (targetPos > gearsList.length) targetPos = gearsList.length

  const currentIdx = gearsList.findIndex(g => String(g.id) === String(gearId))
  if (currentIdx === -1) return

  if (targetPos === currentIdx + 1) {
    showToast(`Món đồ nghề đang ở đúng vị trí ${targetPos}!`, 'info')
    return
  }

  // Array Shift Algorithm (Splice reorder)
  const list = [...gearsList]
  const [movedGear] = list.splice(currentIdx, 1)
  list.splice(targetPos - 1, 0, movedGear)

  const orderedIds = list.map(g => g.id)
  showToast('Đang cập nhật vị trí...', 'info')
  
  const res = await reorderAllGears(orderedIds)

  if (res.success) {
    const gearTitle = movedGear.name || movedGear.title
    showToast(`✓ Đã di chuyển "${gearTitle}" về vị trí số ${targetPos}! Các món khác đã tự động dời.`, 'success')
    await loadGears()
  } else {
    showToast(`❌ Lỗi khi lưu vị trí gear: ${res.error}`, 'error')
  }
}

window.handleMoveGear = async function(gearId, direction) {
  const currentIdx = gearsList.findIndex(g => String(g.id) === String(gearId))
  if (currentIdx === -1) return

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
  if (targetIdx < 0 || targetIdx >= gearsList.length) return

  const list = [...gearsList]
  const [movedGear] = list.splice(currentIdx, 1)
  list.splice(targetIdx, 0, movedGear)

  const orderedIds = list.map(g => g.id)
  const res = await reorderAllGears(orderedIds)

  if (res.success) {
    const gearTitle = movedGear.name || movedGear.title
    showToast(`✓ Đã di chuyển "${gearTitle}" ${direction === 'up' ? 'lên' : 'xuống'} vị trí ${targetIdx + 1}!`, 'success')
    await loadGears()
  } else {
    showToast(`❌ Lỗi khi di chuyển gear: ${res.error}`, 'error')
  }
}

window.openAddGearModal = function() {
  if (!gearForm) return
  gearForm.reset()
  document.getElementById('gear-id').value = ''
  if (gearModalTitle) gearModalTitle.textContent = 'Thêm Gear Mới'
  toggleModal(gearModal, true)
}

window.editGear = function(id) {
  const gear = gearsList.find(g => String(g.id) === String(id))
  if (!gear) return

  document.getElementById('gear-id').value = gear.id
  document.getElementById('gear-name').value = gear.name || gear.title || ''
  document.getElementById('gear-category').value = gear.category || 'Phụ kiện'
  document.getElementById('gear-price').value = gear.footer_text || gear.price || gear.footerText || ''
  document.getElementById('gear-description').value = gear.description || ''
  document.getElementById('gear-link').value = gear.buy_url || gear.link || gear.buyUrl || ''
  document.getElementById('gear-image').value = gear.image || gear.image_url || ''

  if (gearModalTitle) gearModalTitle.textContent = `Sửa Gear: ${gear.name || gear.title}`
  toggleModal(gearModal, true)
}

window.deleteGear = async function(id, name) {
  if (!confirm(`Bạn có chắc chắn muốn xóa gear "${name}"?`)) {
    return
  }

  try {
    await removeGear(id)
    showToast(`✓ Đã xóa gear "${name}" thành công!`, 'success')
    await loadGears()
  } catch (err) {
    showToast(`❌ Lỗi khi xóa gear: ${err.message}`, 'error')
  }
}

if (gearForm) {
  gearForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const gearId = document.getElementById('gear-id').value.trim()
    const isEdit = Boolean(gearId)
    const nameVal = document.getElementById('gear-name').value.trim()
    if (!nameVal) {
      showToast('❌ Vui lòng nhập Tên Thiết Bị / Phụ Kiện!', 'error')
      return
    }

    const payload = {
      title: nameVal,
      name: nameVal,
      category: document.getElementById('gear-category').value.trim() || 'Phụ kiện',
      footer_text: document.getElementById('gear-price').value.trim() || '',
      price: document.getElementById('gear-price').value.trim() || '',
      description: document.getElementById('gear-description').value.trim() || '',
      buy_url: document.getElementById('gear-link').value.trim() || '',
      link: document.getElementById('gear-link').value.trim() || '',
      image: document.getElementById('gear-image').value.trim() || 'assets/avatar.jpg',
      image_url: document.getElementById('gear-image').value.trim() || 'assets/avatar.jpg',
      buy_text: 'Mua ngay'
    }

    try {
      showToast('Đang lưu gear...', 'info')
      const res = await saveGear(payload, isEdit, gearId)

      if (res.success) {
        showToast(isEdit ? `✓ Đã cập nhật gear: "${nameVal}"!` : `✓ Đã thêm gear mới: "${nameVal}"!`, 'success')
        toggleModal(gearModal, false)
        await loadGears()
      } else {
        showToast(`❌ Lưu thất bại: ${res.warning || 'Không thể lưu món đồ nghề'}`, 'error')
      }
    } catch (err) {
      showToast(`❌ Lỗi khi lưu gear: ${err.message}`, 'error')
    }
  })
}


// ==========================================================================
// USERS & ACCESS GRANT (ORDERS) LOGIC
// ==========================================================================

async function loadUsers() {
  try {
    const { data, error } = await supabase.rpc('admin_get_users')
    if (error) throw error
    usersList = data || []
    if (statTotalUsers) statTotalUsers.textContent = usersList.length
    renderUsersTable()
  } catch (err) {
    console.error('Error loading users:', err)
    showToast('Lỗi khi tải danh sách người dùng: ' + err.message, 'error')
  }
}

function renderUsersTable() {
  if (!adminUsersTbody) return
  adminUsersTbody.innerHTML = ''

  let filtered = [...usersList]

  // Filter Search Query
  const q = userSearchQuery.toLowerCase().trim()
  if (q) {
    filtered = filtered.filter(u => 
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    )
  }

  // Sorting
  if (userSortBy === 'newest') {
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  } else if (userSortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  } else if (userSortBy === 'purchases_desc') {
    filtered.sort((a, b) => (b.purchases_count || 0) - (a.purchases_count || 0))
  } else if (userSortBy === 'name_asc') {
    filtered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }

  if (filtered.length === 0) {
    adminUsersTbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-xs text-text-muted">Không tìm thấy người dùng nào phù hợp.</td></tr>`
    return
  }

  filtered.forEach(u => {
    const isSelf = currentAdminId && u.id === currentAdminId
    const isVip = u.purchases_count > 0 || u.role === 'admin'
    const roleBadge = u.role === 'admin' 
      ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider border border-rose-500/30">ADMIN</span>`
      : (isVip ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30 shadow-glow">VIP Member</span>`
               : `<span class="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-glass-border text-text-muted text-[10px] font-medium">Free</span>`)
    
    // Short UUID format: a1b2c3d4...9f8e
    const uuidStr = String(u.id || '')
    const shortUuid = uuidStr.length > 12 
      ? `${uuidStr.slice(0, 8)}...${uuidStr.slice(-4)}`
      : uuidStr

    const tr = document.createElement('tr')
    tr.className = 'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/50 last:border-0'
    tr.innerHTML = `
      <td data-label="Thành viên" class="p-4">
        <div class="flex items-center gap-3 justify-end sm:justify-start">
          <img src="${u.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.full_name || u.email || 'User') + '&background=random'}" alt="Avatar" class="w-9 h-9 rounded-xl border border-glass-border object-cover bg-glass-bg flex-shrink-0">
          <div class="text-right sm:text-left">
            <div class="text-sm font-bold text-text-primary flex items-center justify-end sm:justify-start gap-1.5">
              <span>${escapeHtml(u.full_name || 'Khách Vãng Lai')}</span>
              ${isSelf ? '<span class="text-[10px] text-accent-primary font-bold">(Bạn)</span>' : ''}
            </div>
            <div class="text-xs text-text-muted font-medium">${escapeHtml(u.email || 'Chưa cập nhật email')}</div>
          </div>
        </div>
      </td>
      <td data-label="Mã User (UUID)" class="p-4">
        <div class="flex items-center justify-end sm:justify-start gap-1.5">
          <span class="font-mono text-xs text-accent-primary bg-black/5 dark:bg-white/5 px-2 py-1 rounded-lg border border-glass-border cursor-help" title="${escapeHtml(uuidStr)}">
            ${shortUuid}
          </span>
          <button onclick="copyUserId('${escapeHtml(uuidStr)}')" class="p-1.5 rounded-lg bg-glass-bg border border-glass-border hover:bg-glass-bg-hover hover:border-accent-primary text-text-muted hover:text-accent-primary transition-all cursor-pointer" title="Copy đầy đủ UUID để cấp quyền">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
        </div>
      </td>
      <td data-label="Vai trò" class="p-4 text-center sm:text-center">
        ${roleBadge}
      </td>
      <td data-label="Đã mua" class="p-4 text-center sm:text-center">
        <span class="text-xs font-mono font-bold ${u.purchases_count > 0 ? 'text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20' : 'text-text-muted'}">
          ${u.purchases_count || 0}
        </span>
      </td>
      <td data-label="Yêu thích" class="p-4 text-center sm:text-center">
        <span class="text-xs font-mono font-bold ${u.favorites_count > 0 ? 'text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20' : 'text-text-muted'}">
          ${u.favorites_count || 0}
        </span>
      </td>
      <td data-label="Ngày đăng ký" class="p-4 text-[11px] text-text-muted font-medium">
        ${u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}
      </td>
      <td data-label="Thao tác" class="p-4 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button onclick="selectUserForGrant('${escapeHtml(uuidStr)}')" class="px-2.5 py-1 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary text-[11px] font-bold transition-colors cursor-pointer" title="Cấp quyền tab cho user này">
            Cấp quyền
          </button>
          ${isSelf 
            ? `<button disabled class="p-2 rounded-lg bg-black/5 dark:bg-white/5 text-text-muted opacity-30 cursor-not-allowed" title="Không thể xoá tài khoản của chính mình">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>`
            : `<button onclick="confirmDeleteUser('${escapeHtml(uuidStr)}', '${escapeHtml(u.full_name || 'Khách')}', '${escapeHtml(u.email || '')}')" class="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 transition-all cursor-pointer" title="Xoá vĩnh viễn tài khoản">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>`
          }
        </div>
      </td>
    `
    adminUsersTbody.appendChild(tr)
  })
}

window.copyUserId = function(id) {
  navigator.clipboard.writeText(id)
  showToast('✓ Đã copy toàn bộ UUID: ' + id, 'success')
}

window.selectUserForGrant = function(id) {
  switchTab('grant')
  if (grantUserIdInput) {
    grantUserIdInput.value = id
    grantUserIdInput.focus()
  }
  showToast('✓ Đã nạp UUID vào form cấp quyền!', 'info')
}

window.confirmDeleteUser = async function(id, name, email) {
  const msg = `⚠️ BẠN ĐANG THỰC HIỆN XOÁ TRIỆT ĐỂ USER:\n- Tên: ${name}\n- Email: ${email || 'Chưa có'}\n- UUID: ${id}\n\nHành động này sẽ xoá tài khoản khỏi hệ thống và xoá sạch lịch sử tab đã mua, yêu thích. Bấm OK để xác nhận xoá!`
  if (!confirm(msg)) return

  try {
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: id })
    if (error) throw error
    showToast(`✓ Đã xoá thành công tài khoản "${name}"!`, 'success')
    await loadUsers()
  } catch (err) {
    console.error(err)
    showToast('❌ Lỗi khi xoá user: ' + err.message, 'error')
  }
}

// Populate Grant Dropdown & Paid Songs Grid
function renderPaidSongs() {
  const paidSongs = songsList.filter(s => !s.is_free)
  
  if (statPaidSongsCount) statPaidSongsCount.textContent = `${paidSongs.length} bài`

  // Select dropdown
  if (grantSongSelect) {
    grantSongSelect.innerHTML = '<option value="">-- Chọn bài hát cần cấp quyền --</option>'
    paidSongs.forEach(s => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.title}${s.singer ? ' - ' + s.singer : ''} (${s.price || 'Có phí'})`
      grantSongSelect.appendChild(opt)
    })
  }

  // Cards List
  if (paidSongsList) {
    paidSongsList.innerHTML = ''
    if (paidSongs.length === 0) {
      paidSongsList.innerHTML = `<div class="col-span-2 p-6 text-center text-xs text-text-muted">Chưa có bài hát nào ở chế độ trả phí.</div>`
      return
    }

    paidSongs.forEach(s => {
      const div = document.createElement('div')
      div.className = 'p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-glass-border flex items-center justify-between gap-2 hover:border-accent-primary/40 transition-colors'
      div.innerHTML = `
        <div class="min-w-0">
          <h4 class="text-xs font-bold text-text-primary truncate">${escapeHtml(s.title || 'Không tên')}</h4>
          <p class="text-[10px] text-text-muted truncate">${escapeHtml(s.singer || 'Guitar Solo')} • <span class="text-accent-primary font-bold">${s.price || 'Có phí'}</span></p>
        </div>
        <button onclick="quickSelectSongForGrant('${s.id}')" class="px-2.5 py-1.5 rounded-xl bg-warm-gradient hover:brightness-105 text-white font-bold text-[10px] shadow-xs cursor-pointer whitespace-nowrap active:scale-95 transition-all">
          Cấp quyền
        </button>
      `
      paidSongsList.appendChild(div)
    })
  }
}

window.quickSelectSongForGrant = function(songId) {
  if (grantSongSelect) {
    grantSongSelect.value = songId
  }
  if (grantUserIdInput) {
    grantUserIdInput.focus()
  }
  showToast('✓ Đã chọn bài hát vào form!', 'info')
}

// Load Recent Grant History
async function loadRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-text-muted text-xs">Đang tải lịch sử...</td></tr>`

  try {
    const { data, error } = await supabase.rpc('admin_get_recent_purchases')
    if (error) throw error
    recentGrantsList = data || []
    renderRecentGrants()
  } catch (err) {
    console.error('Error loading recent grants:', err)
    recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-rose-500 text-xs">Lỗi khi tải lịch sử.</td></tr>`
  }
}

function renderRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = ''

  if (recentGrantsList.length === 0) {
    recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-text-muted text-xs">Chưa có lượt cấp quyền nào gần đây.</td></tr>`
    return
  }

  recentGrantsList.forEach(r => {
    const tr = document.createElement('tr')
    tr.className = 'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/40 last:border-0'
    tr.innerHTML = `
      <td data-label="Thành viên" class="p-3">
        <div class="font-bold text-text-primary text-right sm:text-left">${escapeHtml(r.user_name || 'Học viên')}</div>
        <div class="text-[10px] text-text-muted font-mono text-right sm:text-left">${escapeHtml(r.user_email || r.user_id)}</div>
      </td>
      <td data-label="Bài hát đã mở" class="p-3">
        <span class="font-bold text-accent-primary">${escapeHtml(r.song_title || r.song_id)}</span>
      </td>
      <td data-label="Thời gian" class="p-3 text-right text-[11px] text-text-muted font-mono">
        ${r.purchased_at ? new Date(r.purchased_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
      </td>
    `
    recentGrantsTbody.appendChild(tr)
  })
}

// Grant Form Submit Handler
if (grantAccessForm) {
  grantAccessForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const userId = grantUserIdInput.value.trim()
    const songId = grantSongSelect.value

    if (!userId || !songId) {
      showToast('⚠️ Vui lòng chọn bài hát và nhập UUID của User!', 'error')
      return
    }

    const submitBtn = document.getElementById('grant-submit-btn')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Đang xử lý...'
    }

    try {
      const { data, error } = await supabase.rpc('admin_grant_access', {
        p_user_id: userId,
        p_song_id: songId
      })
      if (error) throw error

      showToast('✓ Đã cấp quyền xem Tab thành công!', 'success')
      grantUserIdInput.value = ''
      
      // Reload both lists
      await Promise.all([
        loadUsers(),
        loadRecentGrants()
      ])
    } catch (err) {
      console.error(err)
      showToast('❌ ' + (err.message || 'Lỗi khi cấp quyền'), 'error')
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.innerHTML = '<span>⚡ Xác Nhận Cấp Quyền</span>'
      }
    }
  })
}

// User Search & Sort Event Listeners
if (adminSearchUsers) {
  adminSearchUsers.addEventListener('input', (e) => {
    userSearchQuery = e.target.value
    renderUsersTable()
  })
}

if (adminSortUsers) {
  adminSortUsers.addEventListener('change', (e) => {
    userSortBy = e.target.value
    renderUsersTable()
  })
}

if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener('click', () => loadRecentGrants())
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function initDashboard() {
  const isAuthed = await checkAuth()
  if (!isAuthed) return

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.replace('/admin-login.html')
    })
  }

  // Tab Switcher Helper
  function switchTab(tabId) {
    activeTab = tabId
    
    // Default inactive and active classes supporting 2x2 grid on mobile and flex on desktop
    const baseClass = 'px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center'
    const inactiveClass = `${baseClass} text-text-muted hover:text-text-primary`
    const activeClass = `${baseClass} bg-warm-gradient text-white shadow-xs`
    
    if (tabNavSongs) tabNavSongs.className = tabId === 'songs' ? activeClass : inactiveClass
    if (tabNavGears) tabNavGears.className = tabId === 'gears' ? activeClass : inactiveClass
    if (tabNavUsers) tabNavUsers.className = tabId === 'users' ? activeClass : inactiveClass
    if (tabNavGrant) tabNavGrant.className = tabId === 'grant' ? activeClass : inactiveClass
    
    if (sectionSongs) sectionSongs.classList.toggle('hidden', tabId !== 'songs')
    if (sectionGears) sectionGears.classList.toggle('hidden', tabId !== 'gears')
    if (sectionUsers) sectionUsers.classList.toggle('hidden', tabId !== 'users')
    if (sectionGrant) sectionGrant.classList.toggle('hidden', tabId !== 'grant')

    if (tabId === 'songs') loadSongs()
    if (tabId === 'gears') loadGears()
    if (tabId === 'users') loadUsers()
    if (tabId === 'grant') {
      renderPaidSongs()
      loadRecentGrants()
    }
  }

  window.switchTab = switchTab

  if (tabNavSongs) tabNavSongs.addEventListener('click', () => switchTab('songs'))
  if (tabNavGears) tabNavGears.addEventListener('click', () => switchTab('gears'))
  if (tabNavUsers) tabNavUsers.addEventListener('click', () => switchTab('users'))
  if (tabNavGrant) tabNavGrant.addEventListener('click', () => switchTab('grant'))

  // Open Add Modals
  if (addSongBtn) addSongBtn.addEventListener('click', window.openAddSongModal)
  if (addGearBtn) addGearBtn.addEventListener('click', window.openAddGearModal)

  // Reset / Populate Sample Gears Button
  if (resetGearsBtn) {
    resetGearsBtn.addEventListener('click', async () => {
      if (!confirm('Bạn có muốn nạp lại 4 món đồ nghề mẫu (Clover 914c, AKG Ara, Elixir Bronze, Guitar Pro 8) không?')) return
      showToast('Đang nạp 4 món đồ nghề mẫu...')
      
      try {
        for (const item of DEFAULT_GEARS) {
          const payload = {
            name: item.name || item.title,
            category: item.category,
            price: item.price,
            description: item.description,
            link: item.link || item.buyUrl || item.buy_url,
            image_url: item.image_url || item.image,
            order: item.order
          }
          await supabase.from('gears').upsert([payload])
        }
      } catch (e) {
        console.warn('Upsert gear warning:', e)
      }
      
      localStorage.setItem('gbq_gears', JSON.stringify(DEFAULT_GEARS))
      showToast('✓ Đã nạp thành công 4 món đồ nghề mẫu!')
      await loadGears()
    })
  }

  // Close Modals
  if (closeSongModal) closeSongModal.addEventListener('click', () => toggleModal(songModal, false))
  if (cancelSongModalBtn) cancelSongModalBtn.addEventListener('click', () => toggleModal(songModal, false))
  if (closeGearModal) closeGearModal.addEventListener('click', () => toggleModal(gearModal, false))
  if (cancelGearModalBtn) cancelGearModalBtn.addEventListener('click', () => toggleModal(gearModal, false))
  if (closeCodesModal) closeCodesModal.addEventListener('click', () => toggleModal(codesModal, false))

  // Filter Listeners
  if (adminSearchSongs) {
    adminSearchSongs.addEventListener('input', (e) => {
      songSearchQuery = e.target.value
      renderSongsTable()
    })
  }

  if (adminFilterCategory) {
    adminFilterCategory.addEventListener('change', (e) => {
      songCategoryFilter = e.target.value
      renderSongsTable()
    })
  }

  if (adminFilterType) {
    adminFilterType.addEventListener('change', (e) => {
      songTypeFilter = e.target.value
      renderSongsTable()
    })
  }

  // ==========================================================================
  // CHANGE PASSWORD HANDLERS
  // ==========================================================================
  function showChangePwdError(msg) {
    if (!changePwdError || !changePwdErrorText) return
    changePwdErrorText.textContent = msg
    changePwdError.classList.remove('hidden')
  }

  function hideChangePwdError() {
    if (changePwdError) changePwdError.classList.add('hidden')
  }

  window.openChangePasswordModal = function() {
    hideChangePwdError()
    if (adminNewPassword) {
      adminNewPassword.value = ''
      adminNewPassword.type = 'password'
    }
    if (adminConfirmPassword) {
      adminConfirmPassword.value = ''
      adminConfirmPassword.type = 'password'
    }
    toggleModal(changePasswordModal, true)
    setTimeout(() => adminNewPassword?.focus(), 150)
  }

  if (openChangePasswordBtn) {
    openChangePasswordBtn.addEventListener('click', window.openChangePasswordModal)
  }

  if (closeChangePasswordModal) {
    closeChangePasswordModal.addEventListener('click', () => toggleModal(changePasswordModal, false))
  }

  if (cancelChangePasswordBtn) {
    cancelChangePasswordBtn.addEventListener('click', () => toggleModal(changePasswordModal, false))
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideChangePwdError()

      const newPwd = adminNewPassword?.value || ''
      const confirmPwd = adminConfirmPassword?.value || ''

      if (!newPwd || newPwd.length < 6) {
        showChangePwdError('Mật khẩu mới phải có tối thiểu 6 ký tự!')
        return
      }

      if (newPwd !== confirmPwd) {
        showChangePwdError('Xác nhận mật khẩu không khớp. Vui lòng nhập lại chính xác!')
        return
      }

      if (savePasswordBtn) savePasswordBtn.disabled = true
      if (savePasswordText) savePasswordText.textContent = 'Đang cập nhật...'
      if (savePasswordSpinner) savePasswordSpinner.classList.remove('hidden')

      try {
        const { data, error } = await supabase.auth.updateUser({
          password: newPwd
        })

        if (error) {
          showChangePwdError(`Đổi mật khẩu thất bại: ${error.message}`)
          return
        }

        showToast('✓ Đã cập nhật mật khẩu Admin thành công!', 'success')
        toggleModal(changePasswordModal, false)
        if (adminNewPassword) adminNewPassword.value = ''
        if (adminConfirmPassword) adminConfirmPassword.value = ''
      } catch (err) {
        showChangePwdError(`Lỗi kết nối máy chủ: ${err.message}`)
      } finally {
        if (savePasswordBtn) savePasswordBtn.disabled = false
        if (savePasswordText) savePasswordText.textContent = 'Cập Nhật Mật Khẩu'
        if (savePasswordSpinner) savePasswordSpinner.classList.add('hidden')
      }
    })
  }

  // Load initial data
  loadSongs().then(() => renderPaidSongs())
  loadGears()
  loadUsers()
  loadRecentGrants()
}

document.addEventListener('DOMContentLoaded', initDashboard)
