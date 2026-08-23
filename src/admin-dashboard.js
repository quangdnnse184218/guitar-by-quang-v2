/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN DASHBOARD CMS (admin-dashboard.js)
 * ==============================================================================
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { fetchAllSongs, saveSong, removeSong, reorderAllSongs } from './lib/songs-service.js'
import { fetchAllGears, DEFAULT_GEARS, saveGear, removeGear, reorderAllGears } from './lib/gears-service.js'

initThemeToggle()

// ==========================================================================
// STATE
// ==========================================================================
let songsList = []
let gearsList = []
let activeTab = 'songs' // 'songs' | 'gears'
let songSearchQuery = ''
let songCategoryFilter = 'all'
let songTypeFilter = 'all'

// DOM Elements
const adminUserEmail = document.getElementById('admin-user-email')
const logoutBtn = document.getElementById('logout-btn')
const tabNavSongs = document.getElementById('tab-nav-songs')
const tabNavGears = document.getElementById('tab-nav-gears')
const sectionSongs = document.getElementById('section-songs')
const sectionGears = document.getElementById('section-gears')

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

// Filters
const adminSearchSongs = document.getElementById('admin-search-songs')
const adminFilterCategory = document.getElementById('admin-filter-category')
const adminFilterType = document.getElementById('admin-filter-type')

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
    const priceText = isFree 
      ? '<span class="px-2.5 py-1 rounded-full badge-semantic-success font-bold font-mono text-xs">FREE</span>' 
      : (song.price ? `<span class="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400 text-xs">${Number(song.price).toLocaleString('vi-VN')}đ</span>` : '<span class="text-xs text-rose-600 dark:text-rose-400 font-bold">Có phí</span>')
    const currentOrder = song.order || (idx + 1)
    const isFirst = idx === 0
    const isLast = idx === filtered.length - 1

    return `
      <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors" data-id="${song.id}">
        <!-- Vị Trí & Di Chuyển -->
        <td class="py-3 px-3 text-center">
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

        <td class="py-3.5 px-4 font-bold text-text-primary">
          <div class="flex flex-col">
            <span class="text-sm font-extrabold">${song.title}</span>
            <span class="text-xs text-text-muted font-medium">${song.singer || 'Guitar By Quang'}</span>
          </div>
        </td>
        <td class="py-3.5 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${song.category || 'Fingerstyle'}</span>
        </td>
        <td class="py-3.5 px-3 font-mono tabular-nums font-bold text-accent-primary text-xs">${level}/10</td>
        <td class="py-3.5 px-3 text-text-muted text-xs font-medium">
          ${song.tuning || 'Standard'} / C:${song.capo ?? 0}
        </td>
        <td class="py-3.5 px-3">${priceText}</td>
        <td class="py-3.5 px-3">
          ${isFeatured ? '<span class="badge-semantic-warning px-2 py-0.5 rounded-full font-bold text-xs">★ Ghim</span>' : '<span class="text-text-muted/40 text-xs">—</span>'}
        </td>
        <td class="py-3.5 px-4 text-right">
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

window.openAddSongModal = function() {
  if (!songForm) return
  songForm.reset()
  document.getElementById('song-id').value = ''
  if (songModalTitle) songModalTitle.textContent = 'Thêm Bài Hát Mới'
  toggleModal(songModal, true)
}

window.editSong = function(id) {
  const song = songsList.find(s => String(s.id) === String(id))
  if (!song) return

  document.getElementById('song-id').value = song.id
  document.getElementById('song-title').value = song.title || ''
  document.getElementById('song-singer').value = song.singer || ''
  document.getElementById('song-category').value = song.category || 'Nhạc Việt'
  document.getElementById('song-level').value = song.level_num ?? song.levelNum ?? 5
  document.getElementById('song-tuning').value = song.tuning || 'Standard'
  document.getElementById('song-capo').value = song.capo ?? 0
  document.getElementById('song-youtube-id').value = song.youtube_id || song.youtubeId || ''
  document.getElementById('song-demo-url').value = song.demo_video_url || song.video_demo || song.videoDemo || song.demoVideoUrl || ''
  document.getElementById('song-price').value = song.price ?? ''
  document.getElementById('song-tab-url').value = song.tab_url || song.target_url || song.targetUrl || song.tabUrl || ''
  document.getElementById('song-is-free').checked = Boolean(song.is_free ?? song.isFree)
  document.getElementById('song-is-featured').checked = Boolean(song.is_featured ?? song.isFeatured)

  if (songModalTitle) songModalTitle.textContent = `Sửa Bài Hát: ${song.title}`
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
    const titleVal = document.getElementById('song-title').value.trim()
    if (!titleVal) {
      showToast('❌ Vui lòng nhập Tên Bài Hát!', 'error')
      return
    }

    const levelVal = Number(document.getElementById('song-level').value) || 5
    const isFree = document.getElementById('song-is-free').checked
    const isFeatured = document.getElementById('song-is-featured').checked
    const priceVal = isFree ? 0 : (Number(document.getElementById('song-price').value) || 0)
    const demoVideoVal = document.getElementById('song-demo-url').value.trim()
    const tabUrlVal = document.getElementById('song-tab-url').value.trim()
    const singerVal = document.getElementById('song-singer').value.trim()

    const payload = {
      title: titleVal,
      singer: singerVal || 'Guitar By Quang',
      category: document.getElementById('song-category').value.trim() || 'Nhạc Việt',
      level_num: levelVal,
      level: `${levelVal}/10`,
      tuning: document.getElementById('song-tuning').value.trim() || 'Standard',
      capo: String(document.getElementById('song-capo').value || '0'),
      has_demo: Boolean(demoVideoVal),
      video_demo: demoVideoVal || null,
      price: priceVal,
      price_formatted: isFree ? 'Miễn phí' : (priceVal ? `${priceVal.toLocaleString('vi-VN')}đ` : 'Miễn phí'),
      target_url: tabUrlVal || '',
      button_type: isFree ? 'link' : 'buy',
      button_text: isFree ? (demoVideoVal ? 'Tải video tab' : 'Link xem tab') : 'Mua Video Tab',
      is_free: isFree,
      description: singerVal ? `Ca sĩ / Tác giả: ${singerVal}` : ''
    }

    try {
      showToast('Đang lưu bài hát...', 'info')
      const res = await saveSong(payload, isEdit, songId)
      
      if (res.success) {
        showToast(isEdit ? `✓ Đã cập nhật thành công bài hát: "${titleVal}"!` : `✓ Đã thêm bài hát mới thành công: "${titleVal}"!`, 'success')
        toggleModal(songModal, false)
        await loadSongs()
      } else {
        showToast(`❌ Lưu thất bại: ${res.warning || 'Không thể lưu bài hát'}`, 'error')
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
        <td class="py-3 px-3 text-center">
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

        <td class="py-3.5 px-4 font-bold text-text-primary">
          <div class="flex items-center gap-3">
            <img src="${image}" alt="${name}" class="w-10 h-10 rounded-xl object-cover bg-black/5 border border-glass-border flex-shrink-0" onerror="this.src='/assets/avatar.jpg'" />
            <span class="text-sm font-extrabold">${name}</span>
          </div>
        </td>
        <td class="py-3.5 px-3">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${category}</span>
        </td>
        <td class="py-3.5 px-3 text-text-muted text-xs font-medium max-w-xs truncate">${description}</td>
        <td class="py-3.5 px-3 font-mono tabular-nums font-bold text-text-primary text-xs">${price}</td>
        <td class="py-3.5 px-4 text-right">
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

  // Tab Switcher
  if (tabNavSongs) {
    tabNavSongs.addEventListener('click', () => {
      activeTab = 'songs'
      tabNavSongs.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer bg-warm-gradient text-white shadow-xs'
      tabNavGears.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-text-muted hover:text-text-primary'
      sectionSongs?.classList.remove('hidden')
      sectionGears?.classList.add('hidden')
    })
  }

  if (tabNavGears) {
    tabNavGears.addEventListener('click', () => {
      activeTab = 'gears'
      tabNavGears.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer bg-warm-gradient text-white shadow-xs'
      tabNavSongs.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer text-text-muted hover:text-text-primary'
      sectionGears?.classList.remove('hidden')
      sectionSongs?.classList.add('hidden')
      loadGears()
    })
  }

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

  // Load initial data for both tabs
  loadSongs()
  loadGears()
}

document.addEventListener('DOMContentLoaded', initDashboard)
