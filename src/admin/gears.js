/**
 * ==============================================================================
 * ADMIN DASHBOARD — GEARS MANAGEMENT
 * ==============================================================================
 * Tách từ admin-dashboard.js. Xem ghi chú tương tự trong songs.js.
 */
import { state } from './state.js'
import { showToast } from './toast.js'
import { toggleModal } from './modal.js'
import {
  fetchAllGears,
  saveGear,
  removeGear,
  reorderAllGears,
  normalizeImagePath,
} from '../lib/gears-service.js'
import { uploadToStorage, removeFromStorageByUrl, formatBytes, MAX_UPLOAD_BYTES } from '../lib/storage-service.js'

const adminGearsTbody = document.getElementById('admin-gears-tbody')
const addGearBtn = document.getElementById('add-gear-btn')
const gearModal = document.getElementById('gear-modal')
const closeGearModal = document.getElementById('close-gear-modal')
const cancelGearModalBtn = document.getElementById('cancel-gear-modal-btn')
const gearForm = document.getElementById('gear-form')
const gearModalTitle = document.getElementById('gear-modal-title')

export async function loadGears() {
  state.gearsList = await fetchAllGears()
  renderGearsTable()
}

function renderGearsTable() {
  if (!adminGearsTbody) return

  if (!state.gearsList || state.gearsList.length === 0) {
    adminGearsTbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-text-muted">
          Chưa có món đồ nghề nào trong danh sách. Bấm "+ Thêm Gear Mới" để thêm nhé!
        </td>
      </tr>
    `
    return
  }

  adminGearsTbody.innerHTML = state.gearsList
    .map((gear, idx) => {
      const currentOrder = gear.order || idx + 1
      const isFirst = idx === 0
      const isLast = idx === state.gearsList.length - 1
      const name = gear.name || gear.title || 'Món đồ nghề'
      const image = gear.image_url || gear.image || '/assets/avatar.jpg'
      const category = gear.category || 'Phụ kiện'
      const price = gear.footer_text || gear.price || 'Liên hệ'
      const description = gear.description || 'Chưa có mô tả'

      return `
      <tr class="hover:bg-black/5 dark:hover:bg-white/5 transition-colors admin-gear-card-row" data-id="${gear.id}">
        <!-- Vị Trí & Di Chuyển -->
        <td data-label="Vị Trí" class="py-3 px-3 text-center gear-col-order">
          <div class="inline-flex items-center gap-1 sm:gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border w-full sm:w-auto justify-between sm:justify-center">
            <div class="flex items-center gap-1">
              <span class="text-[10px] font-mono font-extrabold text-accent-primary sm:hidden">#</span>
              <input
                type="number"
                min="1"
                max="${state.gearsList.length}"
                value="${currentOrder}"
                id="order-input-gear-${gear.id}"
                onkeydown="if(event.key==='Enter') window.handleSaveGearPosition('${gear.id}')"
                class="w-9 sm:w-11 text-center py-0.5 sm:py-1 bg-glass-bg border border-glass-border rounded-lg font-mono tabular-nums font-bold text-[11px] sm:text-xs text-text-primary focus:border-accent-primary focus:outline-none shadow-xs"
                title="Nhập số thứ tự vị trí mong muốn rồi bấm Lưu hoặc nhấn Enter"
              />
              <button
                onclick="window.handleSaveGearPosition('${gear.id}')"
                class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-warm-gradient hover:brightness-105 text-white font-bold text-[11px] sm:text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Lưu vị trí mới">
                Lưu
              </button>
            </div>
            <div class="flex sm:flex-col gap-0.5">
              <button
                onclick="window.handleMoveGear('${gear.id}', 'up')"
                ${isFirst ? 'disabled class="p-1 sm:p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-1 sm:p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'}
                title="Di chuyển lên 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button
                onclick="window.handleMoveGear('${gear.id}', 'down')"
                ${isLast ? 'disabled class="p-1 sm:p-0.5 rounded text-text-muted/30 cursor-not-allowed"' : 'class="p-1 sm:p-0.5 rounded hover:bg-glass-bg text-text-primary hover:text-accent-primary transition-colors cursor-pointer"'}
                title="Di chuyển xuống 1 bậc">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </td>

        <td data-label="Ảnh & Tên Thiết Bị" class="py-3.5 px-4 font-bold text-text-primary gear-col-title">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
            <img src="${image}" alt="${name}" class="w-full sm:w-10 aspect-video sm:aspect-square sm:h-10 rounded-xl object-cover bg-black/5 border border-glass-border flex-shrink-0" onerror="this.src='/assets/avatar.jpg'" />
            <div class="flex flex-col text-left">
              <span class="text-xs sm:text-sm font-extrabold line-clamp-2 leading-snug">${name}</span>
              <span class="text-[10px] sm:text-xs text-accent-primary font-bold mt-0.5 sm:hidden font-mono">${price}</span>
            </div>
          </div>
        </td>
        <td data-label="Phân Loại" class="py-3.5 px-3 gear-col-category">
          <span class="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-xs font-bold text-text-muted">${category}</span>
        </td>
        <td data-label="Mô Tả Ngắn" class="py-3.5 px-3 text-text-muted text-xs font-medium max-w-xs truncate gear-col-desc">${description}</td>
        <td data-label="Giá Hiển Thị" class="py-3.5 px-3 font-mono tabular-nums font-bold text-text-primary text-xs gear-col-price">${price}</td>
        <td data-label="Thao Tác" class="py-3.5 px-4 text-right gear-col-actions">
          <div class="flex items-center justify-end gap-1.5 sm:gap-2 w-full">
            <button onclick="window.editGear('${gear.id}')" class="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg sm:rounded-xl bg-warm-gradient hover:brightness-105 text-white font-bold text-xs transition-all shadow-xs text-center cursor-pointer active:scale-95">
              Sửa
            </button>
            <button onclick="window.deleteGear('${gear.id}', '${name.replace(/'/g, "\\'")}')" class="flex-1 sm:flex-initial py-1.5 px-2.5 rounded-lg sm:rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors text-center cursor-pointer active:scale-95">
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
// GEAR POSITION & REORDER HANDLERS
// ==========================================================================

window.handleSaveGearPosition = async function (gearId) {
  const input = document.getElementById(`order-input-gear-${gearId}`)
  if (!input) return

  let targetPos = parseInt(input.value, 10)
  if (isNaN(targetPos) || targetPos < 1) targetPos = 1
  if (targetPos > state.gearsList.length) targetPos = state.gearsList.length

  const currentIdx = state.gearsList.findIndex((g) => String(g.id) === String(gearId))
  if (currentIdx === -1) return

  if (targetPos === currentIdx + 1) {
    showToast(`Món đồ nghề đang ở đúng vị trí ${targetPos}!`, 'info')
    return
  }

  // Array Shift Algorithm (Splice reorder)
  const list = [...state.gearsList]
  const [movedGear] = list.splice(currentIdx, 1)
  list.splice(targetPos - 1, 0, movedGear)

  const orderedIds = list.map((g) => g.id)
  showToast('Đang cập nhật vị trí...', 'info')

  const res = await reorderAllGears(orderedIds)

  if (res.success) {
    const gearTitle = movedGear.name || movedGear.title
    showToast(
      `✓ Đã di chuyển "${gearTitle}" về vị trí số ${targetPos}! Các món khác đã tự động dời.`,
      'success'
    )
    await loadGears()
  } else {
    showToast(`❌ Lỗi khi lưu vị trí gear: ${res.error}`, 'error')
  }
}

window.handleMoveGear = async function (gearId, direction) {
  const currentIdx = state.gearsList.findIndex((g) => String(g.id) === String(gearId))
  if (currentIdx === -1) return

  const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1
  if (targetIdx < 0 || targetIdx >= state.gearsList.length) return

  const list = [...state.gearsList]
  const [movedGear] = list.splice(currentIdx, 1)
  list.splice(targetIdx, 0, movedGear)

  const orderedIds = list.map((g) => g.id)
  const res = await reorderAllGears(orderedIds)

  if (res.success) {
    const gearTitle = movedGear.name || movedGear.title
    showToast(
      `✓ Đã di chuyển "${gearTitle}" ${direction === 'up' ? 'lên' : 'xuống'} vị trí ${targetIdx + 1}!`,
      'success'
    )
    await loadGears()
  } else {
    showToast(`❌ Lỗi khi di chuyển gear: ${res.error}`, 'error')
  }
}

const gearImageFileInput = document.getElementById('gear-image-file')
const gearImageFileName = document.getElementById('gear-image-file-name')

if (gearImageFileInput && gearImageFileName) {
  gearImageFileInput.addEventListener('change', () => {
    const file = gearImageFileInput.files?.[0]
    if (!file) {
      gearImageFileName.textContent = ''
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      gearImageFileName.textContent = `⚠️ ${file.name} (${formatBytes(file.size)}) vượt quá 50MB, sẽ không tải lên được.`
      gearImageFileName.className = 'text-[11px] text-rose-500 truncate flex-1'
    } else {
      gearImageFileName.textContent = `✓ ${file.name} (${formatBytes(file.size)})`
      gearImageFileName.className = 'text-[11px] text-emerald-600 dark:text-emerald-400 truncate flex-1'
    }
  })
}

window.openAddGearModal = function () {
  if (!gearForm) return
  gearForm.reset()
  document.getElementById('gear-id').value = ''
  if (gearImageFileInput) gearImageFileInput.value = ''
  if (gearImageFileName) gearImageFileName.textContent = ''
  if (gearModalTitle) gearModalTitle.textContent = 'Thêm Gear Mới'
  toggleModal(gearModal, true)
}

window.editGear = function (id) {
  const gear = state.gearsList.find((g) => String(g.id) === String(id))
  if (!gear) return

  if (gearImageFileInput) gearImageFileInput.value = ''
  if (gearImageFileName) gearImageFileName.textContent = ''

  document.getElementById('gear-id').value = gear.id
  document.getElementById('gear-name').value = gear.name || gear.title || ''
  document.getElementById('gear-category').value = gear.category || 'Phụ kiện'
  document.getElementById('gear-price').value =
    gear.footer_text || gear.price || gear.footerText || ''
  document.getElementById('gear-description').value = gear.description || ''
  document.getElementById('gear-link').value = gear.buy_url || gear.link || gear.buyUrl || ''
  document.getElementById('gear-image').value = normalizeImagePath(
    gear.image || gear.image_url || ''
  )

  if (gearModalTitle) gearModalTitle.textContent = `Sửa Gear: ${gear.name || gear.title}`
  toggleModal(gearModal, true)
}

window.deleteGear = async function (id, name) {
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

    const selectedFile = gearImageFileInput?.files?.[0]
    let cleanImage
    if (selectedFile) {
      if (selectedFile.size > MAX_UPLOAD_BYTES) {
        showToast(
          `❌ Ảnh quá lớn (${formatBytes(selectedFile.size)}). Gói Supabase miễn phí chỉ cho phép tối đa 50MB/file.`,
          'error'
        )
        return
      }
      const oldImage = document.getElementById('gear-image').value.trim()
      try {
        showToast(`Đang tải ${selectedFile.name} lên...`, 'info')
        cleanImage = await uploadToStorage(selectedFile, 'gears', gearId || 'new')
        if (oldImage) await removeFromStorageByUrl(oldImage)
        gearImageFileInput.value = ''
      } catch (err) {
        showToast(`❌ ${err.message}`, 'error')
        return
      }
    } else {
      const rawImage = document.getElementById('gear-image').value.trim()
      cleanImage = normalizeImagePath(rawImage)
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
      image: cleanImage,
      image_url: cleanImage,
      buy_text: 'Mua ngay',
    }

    try {
      showToast('Đang lưu gear...', 'info')
      const res = await saveGear(payload, isEdit, gearId)

      if (res.success) {
        showToast(
          isEdit ? `✓ Đã cập nhật gear: "${nameVal}"!` : `✓ Đã thêm gear mới: "${nameVal}"!`,
          'success'
        )
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

export function initGearsSection() {
  if (addGearBtn) addGearBtn.addEventListener('click', window.openAddGearModal)
  if (closeGearModal) closeGearModal.addEventListener('click', () => toggleModal(gearModal, false))
  if (cancelGearModalBtn)
    cancelGearModalBtn.addEventListener('click', () => toggleModal(gearModal, false))
}
