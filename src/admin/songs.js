/**
 * ==============================================================================
 * ADMIN DASHBOARD — SONGS MANAGEMENT
 * ==============================================================================
 * Tách từ admin-dashboard.js (trước đây 1 file ~1455 dòng gộp cả songs/gears/
 * users/grant). Các hàm window.* giữ nguyên để khớp với onclick="..." được
 * sinh ra trong renderSongsTable (không đổi được sang addEventListener vì
 * HTML sinh động bằng chuỗi template).
 */
import { state } from './state.js'
import { showToast } from './toast.js'
import { toggleModal } from './modal.js'
import {
  fetchAllSongs,
  saveSong,
  removeSong,
  reorderAllSongs,
  extractYoutubeId,
  normalizeVideoPath,
  normalizeAudioPath,
} from '../lib/songs-service.js'
import { uploadToStorage, removeFromStorageByUrl, formatBytes, MAX_UPLOAD_BYTES } from '../lib/storage-service.js'

const adminSongsTbody = document.getElementById('admin-songs-tbody')
const addSongBtn = document.getElementById('add-song-btn')
const songModal = document.getElementById('song-modal')
const closeSongModal = document.getElementById('close-song-modal')
const cancelSongModalBtn = document.getElementById('cancel-song-modal-btn')
const songForm = document.getElementById('song-form')
const songModalTitle = document.getElementById('song-modal-title')

const statTotalSongs = document.getElementById('stat-total-songs')
const statFreeSongs = document.getElementById('stat-free-songs')
const statPaidSongs = document.getElementById('stat-paid-songs')
const statFeaturedSongs = document.getElementById('stat-featured-songs')

const adminSearchSongs = document.getElementById('admin-search-songs')
const adminFilterCategory = document.getElementById('admin-filter-category')
const adminFilterType = document.getElementById('admin-filter-type')

export async function loadSongs() {
  state.songsList = await fetchAllSongs()
  updateStats()
  renderSongsTable()
}

function updateStats() {
  if (!state.songsList) return

  const total = state.songsList.length
  const free = state.songsList.filter((s) => s.is_free ?? s.isFree).length
  const paid = total - free
  const featured = state.songsList.filter((s) => s.is_featured ?? s.isFeatured).length

  if (statTotalSongs) statTotalSongs.textContent = total
  if (statFreeSongs) statFreeSongs.textContent = free
  if (statPaidSongs) statPaidSongs.textContent = paid
  if (statFeaturedSongs) statFeaturedSongs.textContent = featured
}

function renderSongsTable() {
  if (!adminSongsTbody) return

  let filtered = [...state.songsList]

  // Filter Search
  if (state.songSearchQuery.trim()) {
    const q = state.songSearchQuery.toLowerCase().trim()
    filtered = filtered.filter(
      (s) =>
        (s.title && s.title.toLowerCase().includes(q)) ||
        (s.singer && s.singer.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q))
    )
  }

  // Filter Category
  if (state.songCategoryFilter !== 'all') {
    filtered = filtered.filter(
      (s) => (s.category || 'Fingerstyle').toLowerCase() === state.songCategoryFilter.toLowerCase()
    )
  }

  // Filter Type (Free / Paid)
  if (state.songTypeFilter === 'free') {
    filtered = filtered.filter((s) => s.is_free ?? s.isFree)
  } else if (state.songTypeFilter === 'paid') {
    filtered = filtered.filter((s) => !(s.is_free ?? s.isFree))
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

  adminSongsTbody.innerHTML = filtered
    .map((song, idx) => {
      const isFree = song.is_free ?? song.isFree ?? false
      const isFeatured = song.is_featured ?? song.isFeatured ?? false
      const level = song.level_num ?? song.levelNum ?? 5
      const priceDisplay = isFree
        ? 'FREE'
        : formatCompactPrice(song.price_formatted || song.priceFormatted || song.price)
      const priceText = isFree
        ? '<span class="px-2.5 py-1 rounded-full badge-semantic-success font-bold font-mono text-xs">FREE</span>'
        : `<span class="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400 text-xs">${priceDisplay}</span>`
      const currentOrder = song.order || idx + 1
      const isFirst = idx === 0
      const isLast = idx === filtered.length - 1

      return `
      <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors admin-song-card-row" data-id="${song.id}">
        <!-- Vị Trí & Di Chuyển -->
        <td data-label="Vị Trí & Thứ Tự" class="py-3 px-3 text-center song-col-order">
          <div class="inline-flex items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border w-full sm:w-auto justify-between sm:justify-center">
            <div class="flex items-center gap-1">
              <span class="text-[10px] font-mono font-extrabold text-accent-primary sm:hidden">#</span>
              <input
                type="number"
                min="1"
                max="${state.songsList.length}"
                value="${currentOrder}"
                id="order-input-song-${song.id}"
                onkeydown="if(event.key==='Enter') window.handleSaveSongPosition('${song.id}')"
                class="w-9 sm:w-11 text-center py-0.5 sm:py-1 bg-glass-bg border border-glass-border rounded-lg font-mono tabular-nums font-bold text-[11px] sm:text-xs text-text-primary focus:border-accent-primary focus:outline-none shadow-xs"
                title="Nhập số thứ tự vị trí mong muốn rồi bấm Lưu hoặc nhấn Enter"
              />
              <button
                onclick="window.handleSaveSongPosition('${song.id}')"
                class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-warm-gradient hover:brightness-105 text-white font-bold text-[11px] sm:text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Lưu vị trí mới: Bài này sẽ chèn vào vị trí trên, các bài khác tự động dời">
                Lưu
              </button>
            </div>
            <div class="flex sm:flex-col gap-0.5">
              <button
                onclick="window.handleMoveSong('${song.id}', 'up')"
                ${isFirst ? 'disabled class="p-1 sm:p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-1 sm:p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'}
                title="Di chuyển lên 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button
                onclick="window.handleMoveSong('${song.id}', 'down')"
                ${isLast ? 'disabled class="p-1 sm:p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-1 sm:p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'}
                title="Di chuyển xuống 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </td>

        <td data-label="Bài Hát" class="py-3.5 px-4 font-bold text-text-primary song-col-title">
          <div class="flex flex-col text-left">
            <span class="text-xs sm:text-sm font-extrabold line-clamp-2 leading-snug">${song.title}</span>
            <span class="text-[10px] sm:text-xs text-text-muted font-medium mt-0.5">${song.singer || 'Guitar By Quang'}</span>
          </div>
        </td>
        <td data-label="Thể Loại" class="py-3.5 px-3 song-col-category">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${song.category || 'Fingerstyle'}</span>
        </td>
        <td data-label="Độ Khó" class="py-3.5 px-3 font-mono tabular-nums font-bold text-accent-primary text-xs song-col-level">${level}/10</td>
        <td data-label="Tuning / Capo" class="py-3.5 px-3 text-text-muted text-xs font-medium song-col-tuning">
          ${song.tuning || 'Standard'} / C:${song.capo ?? 0}
        </td>
        <td data-label="Loại / Giá" class="py-3.5 px-3 song-col-price">${priceText}</td>
        <td data-label="Nổi Bật" class="py-3.5 px-3 song-col-featured">
          ${isFeatured ? '<span class="badge-semantic-warning px-2 py-0.5 rounded-full font-bold text-xs">★ Ghim</span>' : '<span class="text-text-muted/40 text-xs hidden md:inline">—</span>'}
        </td>
        <td data-label="Thao Tác" class="py-3.5 px-4 text-right song-col-actions">
          <div class="flex items-center justify-end gap-1.5 sm:gap-2 w-full">
            <button onclick="window.editSong('${song.id}')" class="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg sm:rounded-xl bg-warm-gradient hover:brightness-105 text-white font-bold text-xs transition-all shadow-xs text-center cursor-pointer active:scale-95">
              Sửa
            </button>
            <button onclick="window.deleteSong('${song.id}', '${song.title.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-initial py-1.5 px-2.5 rounded-lg sm:rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors text-center cursor-pointer active:scale-95">
              Xóa
            </button>
          </div>
        </td>
      </tr>
    `
    })
    .join('')
}

// ==========================================================================
// SONG POSITION & REORDER HANDLERS
// ==========================================================================

window.handleSaveSongPosition = async function (songId) {
  const input = document.getElementById(`order-input-song-${songId}`)
  if (!input) return

  let targetPos = parseInt(input.value, 10)
  if (isNaN(targetPos) || targetPos < 1) targetPos = 1
  if (targetPos > state.songsList.length) targetPos = state.songsList.length

  const currentIdx = state.songsList.findIndex((s) => String(s.id) === String(songId))
  if (currentIdx === -1) return

  if (targetPos === currentIdx + 1) {
    showToast(`Bài hát đang ở đúng vị trí ${targetPos}!`, 'info')
    return
  }

  // Array Shift Algorithm (Splice reorder)
  const list = [...state.songsList]
  const [movedSong] = list.splice(currentIdx, 1)
  list.splice(targetPos - 1, 0, movedSong)

  const orderedIds = list.map((s) => s.id)
  showToast('Đang cập nhật vị trí...', 'info')

  const res = await reorderAllSongs(orderedIds)

  if (res.success) {
    showToast(
      `✓ Đã di chuyển "${movedSong.title}" về vị trí số ${targetPos}! Các bài khác đã tự động dời.`,
      'success'
    )
    await loadSongs()
  } else {
    showToast(`❌ Lỗi khi lưu vị trí: ${res.error}`, 'error')
  }
}

window.handleMoveSong = async function (songId, direction) {
  const currentIdx = state.songsList.findIndex((s) => String(s.id) === String(songId))
  if (currentIdx === -1) return

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
  if (targetIdx < 0 || targetIdx >= state.songsList.length) return

  const list = [...state.songsList]
  const [movedSong] = list.splice(currentIdx, 1)
  list.splice(targetIdx, 0, movedSong)

  const orderedIds = list.map((s) => s.id)
  const res = await reorderAllSongs(orderedIds)

  if (res.success) {
    showToast(
      `✓ Đã di chuyển "${movedSong.title}" ${direction === 'up' ? 'lên' : 'xuống'} vị trí ${targetIdx + 1}!`,
      'success'
    )
    await loadSongs()
  } else {
    showToast(`❌ Lỗi khi di chuyển bài hát: ${res.error}`, 'error')
  }
}

window.setSongModalType = function (type) {
  const typeInput = document.getElementById('song-type')
  const freeBtn = document.getElementById('tab-btn-free')
  const paidBtn = document.getElementById('tab-btn-paid')
  const freeFields = document.getElementById('fields-free-song')
  const paidFields = document.getElementById('fields-paid-song')

  if (typeInput) typeInput.value = type

  if (type === 'free') {
    if (freeBtn) {
      freeBtn.className =
        'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer bg-emerald-600 text-white shadow-xs'
    }
    if (paidBtn) {
      paidBtn.className =
        'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-text-muted hover:text-text-primary'
    }
    freeFields?.classList.remove('hidden')
    paidFields?.classList.add('hidden')
  } else {
    if (paidBtn) {
      paidBtn.className =
        'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer bg-rose-600 text-white shadow-xs'
    }
    if (freeBtn) {
      freeBtn.className =
        'py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-text-muted hover:text-text-primary'
    }
    freeFields?.classList.add('hidden')
    paidFields?.classList.remove('hidden')
  }
}

window.openAddSongModal = function (type = 'free') {
  if (!songForm) return
  songForm.reset()
  document.getElementById('song-id').value = ''
  UPLOAD_FIELDS.forEach(({ nameId }) => {
    const span = document.getElementById(nameId)
    if (span) span.textContent = ''
  })
  window.setSongModalType(type)

  if (type === 'free') {
    document.getElementById('song-level').value = '5'
    document.getElementById('song-tuning').value = 'Standard'
    document.getElementById('song-capo').value = '0'
    document.getElementById('song-duration').value = '03:15'
    document.getElementById('song-free-audio-url').value = ''
    document.getElementById('song-thumbnail-bg').value = 'from-[#D8C4AC] to-[#647A6C]'
    if (songModalTitle) songModalTitle.textContent = '🎁 Thêm Tab Miễn Phí Mới (Free Tab)'
  } else {
    document.getElementById('song-level').value = '8'
    document.getElementById('song-tuning').value = 'Standard'
    document.getElementById('song-capo').value = '1'
    document.getElementById('song-duration').value = '03:40'
    document.getElementById('song-paid-price').value = '239k'
    document.getElementById('song-paid-discount').value = 'HSSV: 179k'
    document.getElementById('song-paid-audio-url').value = ''
    document.getElementById('song-thumbnail-bg').value = 'from-[#C1602F] to-[#6E3B1F]'
    if (songModalTitle) songModalTitle.textContent = '💎 Thêm Video Tab Có Phí Mới (Mua Tab)'
  }
  toggleModal(songModal, true)
}

function formatCompactPrice(val) {
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

window.editSong = function (id) {
  const song = state.songsList.find((s) => String(s.id) === String(id))
  if (!song) return

  const isSongFree = Boolean(song.is_free ?? song.isFree ?? Number(song.price) === 0)
  const songType = isSongFree ? 'free' : 'paid'

  UPLOAD_FIELDS.forEach(({ fileId, nameId }) => {
    const fileInput = document.getElementById(fileId)
    const span = document.getElementById(nameId)
    if (fileInput) fileInput.value = ''
    if (span) span.textContent = ''
  })

  document.getElementById('song-id').value = song.id
  document.getElementById('song-title').value = song.title || ''
  document.getElementById('song-singer').value = song.singer || ''
  document.getElementById('song-category').value = song.category || 'Nhạc Việt'
  document.getElementById('song-level').value =
    song.level_num ?? song.levelNum ?? (isSongFree ? 5 : 8)
  document.getElementById('song-tuning').value = song.tuning || 'Standard'
  document.getElementById('song-capo').value = song.capo ?? (isSongFree ? 0 : 1)
  document.getElementById('song-duration').value = song.duration || (isSongFree ? '03:15' : '03:40')
  document.getElementById('song-description').value = song.description || ''
  document.getElementById('song-thumbnail-bg').value =
    song.thumbnail_bg ||
    song.thumbnailBg ||
    (isSongFree ? 'from-[#D8C4AC] to-[#647A6C]' : 'from-[#C1602F] to-[#6E3B1F]')
  document.getElementById('song-is-featured').checked = Boolean(song.is_featured ?? song.isFeatured)

  const audioDemoVal = song.audio_demo || song.demo_audio_url || song.audio_url || ''

  if (isSongFree) {
    const rawTarget =
      song.target_url ||
      song.tab_url ||
      (song.youtube_id?.length === 11 ? `https://youtu.be/${song.youtube_id}` : song.youtube_id) ||
      song.video_demo ||
      ''
    document.getElementById('song-free-target-url').value = rawTarget
    document.getElementById('song-free-audio-url').value = audioDemoVal
    document.getElementById('song-free-pdf-url').value = song.pdf_url || song.pdfUrl || ''
  } else {
    document.getElementById('song-paid-price').value =
      song.price_formatted ||
      song.priceFormatted ||
      (song.price ? formatCompactPrice(song.price) : '239k')
    document.getElementById('song-paid-discount').value =
      song.discount_note || song.discountNote || 'HSSV: 179k'
    document.getElementById('song-paid-demo-url').value =
      song.demo_video_url ||
      song.video_demo ||
      song.videoDemo ||
      (song.youtube_id?.length === 11 ? `https://youtu.be/${song.youtube_id}` : song.youtube_id) ||
      ''
    document.getElementById('song-paid-audio-url').value = audioDemoVal
    document.getElementById('song-paid-drive-url').value =
      song.tab_url || song.target_url || song.targetUrl || song.tabUrl || ''
  }

  window.setSongModalType(songType)

  if (songModalTitle) {
    songModalTitle.textContent = `Sửa Bài Hát: ${song.title}`
  }
  toggleModal(songModal, true)
}

window.deleteSong = async function (id, title) {
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

// ==========================================================================
// FILE UPLOAD — chọn file trực tiếp từ máy thay vì gõ đường dẫn thủ công
// ==========================================================================
const UPLOAD_FIELDS = [
  { fileId: 'song-free-target-file', nameId: 'song-free-target-file-name' },
  { fileId: 'song-free-audio-file', nameId: 'song-free-audio-file-name' },
  { fileId: 'song-paid-demo-file', nameId: 'song-paid-demo-file-name' },
  { fileId: 'song-paid-audio-file', nameId: 'song-paid-audio-file-name' },
]

UPLOAD_FIELDS.forEach(({ fileId, nameId }) => {
  const fileInput = document.getElementById(fileId)
  const nameSpan = document.getElementById(nameId)
  if (!fileInput || !nameSpan) return
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) {
      nameSpan.textContent = ''
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      nameSpan.textContent = `⚠️ ${file.name} (${formatBytes(file.size)}) vượt quá 50MB, sẽ không tải lên được.`
      nameSpan.className = 'text-[11px] text-rose-500 truncate flex-1'
    } else {
      nameSpan.textContent = `✓ ${file.name} (${formatBytes(file.size)})`
      nameSpan.className = 'text-[11px] text-emerald-600 dark:text-emerald-400 truncate flex-1'
    }
  })
})

/**
 * If a file was picked in `fileInputId`, upload it to Storage (deleting the
 * previous Storage file at `oldUrl` when replacing one on edit) and return
 * the new public URL. Otherwise falls back to whatever's typed in the text
 * input — preserves the old "paste a URL/path" workflow unchanged.
 */
async function resolveMediaUrl(textInputId, fileInputId, folder, prefix) {
  const fileInput = document.getElementById(fileInputId)
  const file = fileInput?.files?.[0]
  const currentVal = document.getElementById(textInputId).value.trim()

  if (!file) return currentVal

  showToast(`Đang tải ${file.name} lên...`, 'info')
  const url = await uploadToStorage(file, folder, prefix)
  if (currentVal) await removeFromStorageByUrl(currentVal)
  fileInput.value = ''
  return url
}

// Handler Submit Song Modal Form
if (songForm) {
  songForm.addEventListener('submit', async (e) => {
    e.preventDefault()

    const songId = document.getElementById('song-id').value.trim()
    const isEdit = Boolean(songId)
    const type = document.getElementById('song-type')?.value || 'free'
    const isFree = type === 'free'

    const titleVal = document.getElementById('song-title').value.trim()
    if (!titleVal) {
      showToast('⚠️ Vui lòng nhập Tên Bài Hát!', 'warning')
      document.getElementById('song-title').focus()
      return
    }

    const singerVal = document.getElementById('song-singer').value.trim()
    const categoryVal = document.getElementById('song-category').value.trim() || 'Nhạc Việt'
    const levelVal = Number(document.getElementById('song-level').value) || (isFree ? 5 : 8)
    const tuningVal = document.getElementById('song-tuning').value.trim() || 'Standard'
    const capoVal = String(document.getElementById('song-capo').value ?? (isFree ? '0' : '1'))
    const durationVal =
      document.getElementById('song-duration').value.trim() || (isFree ? '03:15' : '03:40')
    const thumbnailBgVal =
      document.getElementById('song-thumbnail-bg').value ||
      (isFree ? 'from-[#D8C4AC] to-[#647A6C]' : 'from-[#C1602F] to-[#6E3B1F]')
    const descriptionVal = document.getElementById('song-description').value.trim()
    const isFeatured = document.getElementById('song-is-featured').checked

    let payload = {}
    const uploadPrefix = songId || 'new'

    if (isFree) {
      let freeTargetUrl, freeAudioUrl
      try {
        freeTargetUrl = await resolveMediaUrl(
          'song-free-target-url',
          'song-free-target-file',
          'songs',
          uploadPrefix
        )
        freeAudioUrl = await resolveMediaUrl(
          'song-free-audio-url',
          'song-free-audio-file',
          'songs',
          uploadPrefix
        )
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error')
        return
      }
      const freePdfUrl = document.getElementById('song-free-pdf-url').value.trim()

      const ytId = freeTargetUrl ? extractYoutubeId(freeTargetUrl) : null
      const cleanTarget = freeTargetUrl ? normalizeVideoPath(freeTargetUrl) : ''
      const cleanAudio = freeAudioUrl ? normalizeAudioPath(freeAudioUrl) : ''
      const hasDemo = Boolean(
        ytId || (cleanTarget && cleanTarget.toLowerCase().includes('.mp4')) || cleanAudio
      )

      payload = {
        title: titleVal,
        singer: singerVal || 'Guitar By Quang',
        category: categoryVal,
        level_num: levelVal,
        level: `${levelVal}/10`,
        tuning: tuningVal,
        capo: capoVal,
        duration: durationVal,
        description:
          descriptionVal ||
          (singerVal
            ? `Ca sĩ / Tác giả: ${singerVal}. Bản tab miễn phí kèm video/audio hướng dẫn từ Guitar By Quang.`
            : 'Bản tab guitar fingerstyle miễn phí kèm hướng dẫn.'),
        is_free: true,
        price: 0,
        price_formatted: 'Miễn phí',
        priceFormatted: 'Miễn phí',
        discount_note: null,
        has_demo: hasDemo,
        video_demo: cleanTarget || null,
        demo_video_url: cleanTarget || null,
        audio_demo: cleanAudio || null,
        demo_audio_url: cleanAudio || null,
        audio_url: cleanAudio || null,
        youtube_id: ytId || null,
        target_url: cleanTarget || '',
        tab_url: cleanTarget || '',
        pdf_url: freePdfUrl || null,
        thumbnail_bg: thumbnailBgVal,
        button_type: 'link',
        button_text: 'Link xem tab',
        is_featured: isFeatured,
      }
    } else {
      const priceRaw = document.getElementById('song-paid-price').value.trim() || '239k'
      const priceFormatted = formatCompactPrice(priceRaw)
      const numericPrice = Number(priceRaw.replace(/[^0-9]/g, '')) || 239000
      const priceVal = numericPrice < 1000 && numericPrice > 0 ? numericPrice * 1000 : numericPrice
      const discountNoteVal =
        document.getElementById('song-paid-discount').value.trim() || 'HSSV: 179k'
      let demoUrlVal, paidAudioUrl
      try {
        demoUrlVal = await resolveMediaUrl(
          'song-paid-demo-url',
          'song-paid-demo-file',
          'songs',
          uploadPrefix
        )
        paidAudioUrl = await resolveMediaUrl(
          'song-paid-audio-url',
          'song-paid-audio-file',
          'songs',
          uploadPrefix
        )
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error')
        return
      }
      const driveUrlVal = document.getElementById('song-paid-drive-url').value.trim()

      const ytId = demoUrlVal ? extractYoutubeId(demoUrlVal) : null
      const cleanDemo = demoUrlVal ? normalizeVideoPath(demoUrlVal) : ''
      const cleanAudio = paidAudioUrl ? normalizeAudioPath(paidAudioUrl) : ''
      const cleanDrive = driveUrlVal ? driveUrlVal.trim() : ''
      const hasDemo = Boolean(
        ytId ||
        (cleanDemo &&
          (cleanDemo.toLowerCase().includes('.mp4') ||
            cleanDemo.startsWith('http') ||
            cleanDemo.startsWith('/'))) ||
        cleanAudio
      )

      payload = {
        title: titleVal,
        singer: singerVal || 'Guitar By Quang',
        category: categoryVal,
        level_num: levelVal,
        level: `${levelVal}/10`,
        tuning: tuningVal,
        capo: capoVal,
        duration: durationVal,
        description:
          descriptionVal ||
          (singerVal
            ? `Ca sĩ / Tác giả: ${singerVal}. Fingerstyle nâng cao kèm video chi tiết.`
            : 'Bản Video Tab độc quyền chất lượng cao từ Guitar By Quang.'),
        is_free: false,
        price: priceVal,
        price_formatted: priceFormatted,
        priceFormatted: priceFormatted,
        discount_note: discountNoteVal,
        has_demo: hasDemo,
        video_demo: cleanDemo || null,
        demo_video_url: cleanDemo || null,
        audio_demo: cleanAudio || null,
        demo_audio_url: cleanAudio || null,
        audio_url: cleanAudio || null,
        youtube_id: ytId || null,
        target_url: cleanDrive || '',
        tab_url: cleanDrive || '',
        pdf_url: null,
        thumbnail_bg: thumbnailBgVal,
        button_type: 'buy',
        button_text: 'Mua Video Tab',
        is_featured: isFeatured,
      }
    }

    try {
      showToast('Đang lưu bài hát...', 'info')
      const res = await saveSong(payload, isEdit, songId)

      if (res.success) {
        showToast(
          isEdit
            ? `✓ Đã cập nhật thành công bài hát: "${titleVal}"!`
            : `✓ Đã thêm bài hát mới thành công: "${titleVal}"!`,
          'success'
        )
        toggleModal(songModal, false)
        await loadSongs()
      } else {
        showToast(
          `❌ Lưu thất bại: ${res.error || res.warning || 'Không thể lưu bài hát vào Supabase'}`,
          'error'
        )
      }
    } catch (err) {
      showToast(`❌ Lỗi khi lưu bài hát: ${err.message}`, 'error')
    }
  })
}

export function initSongsSection() {
  if (addSongBtn) addSongBtn.addEventListener('click', window.openAddSongModal)
  if (closeSongModal) closeSongModal.addEventListener('click', () => toggleModal(songModal, false))
  if (cancelSongModalBtn)
    cancelSongModalBtn.addEventListener('click', () => toggleModal(songModal, false))

  if (adminSearchSongs) {
    adminSearchSongs.addEventListener('input', (e) => {
      state.songSearchQuery = e.target.value
      renderSongsTable()
    })
  }

  if (adminFilterCategory) {
    adminFilterCategory.addEventListener('change', (e) => {
      state.songCategoryFilter = e.target.value
      renderSongsTable()
    })
  }

  if (adminFilterType) {
    adminFilterType.addEventListener('change', (e) => {
      state.songTypeFilter = e.target.value
      renderSongsTable()
    })
  }
}
