/**
 * ==============================================================================
 * ADMIN DASHBOARD — CẤP QUYỀN THỦ CÔNG
 * ==============================================================================
 * Dùng khi khách đã trả tiền mà hệ thống chưa tự mở tab (chuyển khoản sai nội
 * dung, trả tiền mặt...) hoặc khi admin muốn tặng tab.
 *
 * Thiết kế theo 3 bước tuần tự — khách → tab → lý do — kèm khung "Tóm tắt" bên
 * phải luôn nói rõ điều gì sẽ xảy ra khi bấm cấp. Các quyết định dễ nhầm được
 * chặn ngay trên giao diện thay vì đợi lỗi từ server:
 *   • Tab khách đã sở hữu bị khoá trong danh sách chọn.
 *   • Lý do KHÔNG có mặc định: nó quyết định đơn chờ tương ứng được ghi là "đã
 *     thanh toán" (tính doanh thu) hay "hết hạn", nên admin phải chủ động chọn.
 *   • Nút cấp chỉ bật khi đủ cả 3 bước.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { loadSongs } from './songs.js'
import { loadUsers } from './users.js'
import { loadPendingOrders } from './orders.js'
import { escapeHtml, formatVnd, avatarUrlFor } from './format.js'

const form = document.getElementById('grant-access-form')
const userSearch = document.getElementById('grant-user-search')
const userResults = document.getElementById('grant-user-results')
const userCard = document.getElementById('grant-user-card')
const userAvatar = document.getElementById('grant-user-avatar')
const userName = document.getElementById('grant-user-name')
const userEmail = document.getElementById('grant-user-email')
const userMeta = document.getElementById('grant-user-meta')
const userClear = document.getElementById('grant-user-clear')
const songSearch = document.getElementById('grant-song-search')
const songList = document.getElementById('grant-song-list')
const reasonList = document.getElementById('grant-reason-list')
const noteInput = document.getElementById('grant-note')
const summaryEl = document.getElementById('grant-summary')
const warningsEl = document.getElementById('grant-warnings')
const submitBtn = document.getElementById('grant-submit-btn')
const resultEl = document.getElementById('grant-result')

/**
 * `paid` = lý do này nghĩa là ĐÃ nhận được tiền → đơn chờ khớp được ghi là "đã
 * thanh toán". Khớp với PAID_REASONS trong hàm SQL admin_grant_access.
 */
const REASONS = [
  { value: 'bank_wrong_note', label: 'Khách chuyển khoản sai nội dung', hint: 'Đã nhận tiền', paid: true },
  { value: 'offline_payment', label: 'Thanh toán ngoài SePay', hint: 'Tiền mặt, ví khác — đã nhận tiền', paid: true },
  { value: 'gift', label: 'Tặng / khuyến mãi', hint: 'Không thu tiền', paid: false },
  { value: 'compensation', label: 'Đền bù lỗi hệ thống', hint: 'Không thu tiền', paid: false },
  { value: 'other', label: 'Lý do khác', hint: 'Không thu tiền — ghi rõ ở ghi chú', paid: false },
]

let selectedUser = null
let selectedSongId = null
let selectedReason = null
/** Kết quả admin_check_grant_context cho cặp (khách, tab) đang chọn. */
let context = null
/** Tab khách đang sở hữu / đang có đơn chờ — nạp khi chọn khách. */
let ownedSongIds = new Set()
let pendingSongIds = new Set()
/** Chống ghi đè kết quả cũ khi admin đổi lựa chọn nhanh. */
let contextRequestId = 0

const ICON_CHECK =
  '<svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
const ICON_WARN =
  '<svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>'

function paidSongs() {
  return state.songsList.filter((s) => !s.is_free)
}

function findSong(id) {
  return state.songsList.find((s) => s.id === id) || null
}

function hasDriveLink(song) {
  return !!song?.target_url && /\/(file\/d|folders)\//.test(song.target_url)
}

// ----------------------------------------------------------------------------
// BƯỚC 1 — chọn khách
// ----------------------------------------------------------------------------
function renderUserResults(list) {
  if (!userResults) return

  if (list.length === 0) {
    userResults.innerHTML = `<div class="p-3 text-xs text-text-muted text-center">Không tìm thấy thành viên nào.</div>`
    userResults.classList.remove('hidden')
    return
  }

  userResults.innerHTML = ''
  list.slice(0, 8).forEach((u) => {
    const item = document.createElement('button')
    item.type = 'button'
    item.className =
      'w-full flex items-center gap-2.5 p-2.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-left cursor-pointer'
    item.innerHTML = `
      <img src="${escapeHtml(avatarUrlFor(u))}" alt="" class="w-8 h-8 rounded-lg object-cover border border-glass-border flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="text-xs font-bold text-text-primary truncate">${escapeHtml(u.full_name || 'Khách vãng lai')}</div>
        <div class="text-[10px] text-text-muted truncate">${escapeHtml(u.email || 'chưa có email')}</div>
      </div>
      <span class="text-[10px] font-mono text-text-muted flex-shrink-0">${u.purchases_count || 0} tab</span>`
    item.addEventListener('click', () => selectUser(u))
    userResults.appendChild(item)
  })
  userResults.classList.remove('hidden')
}

function matchingUsers(query) {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return state.usersList.filter(
    (u) =>
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
  )
}

/** Tab khách đã sở hữu + tab đang có đơn chờ — để khoá/gắn nhãn trong bước 2. */
async function loadUserHoldings(userId) {
  ownedSongIds = new Set()
  pendingSongIds = new Set()
  try {
    const { data, error } = await supabase.rpc('admin_get_user_detail', { p_user_id: userId })
    if (error) throw error
    ownedSongIds = new Set((data?.purchases || []).map((p) => p.song_id))
    pendingSongIds = new Set(
      (data?.orders || []).filter((o) => o.status === 'pending').map((o) => o.song_id)
    )
  } catch (err) {
    // Không chặn luồng: server vẫn từ chối cấp trùng, chỉ mất phần khoá sớm.
    console.warn('Không nạp được danh sách tab của khách:', err.message)
  }
}

async function selectUser(user) {
  selectedUser = user
  resultEl?.classList.add('hidden')

  if (userAvatar) userAvatar.src = avatarUrlFor(user)
  if (userName) userName.textContent = user.full_name || 'Khách vãng lai'
  if (userEmail) userEmail.textContent = user.email || 'Chưa có email'
  if (userMeta) userMeta.textContent = `Đang sở hữu ${user.purchases_count || 0} tab`
  userCard?.classList.remove('hidden')
  userCard?.classList.add('flex')
  userResults?.classList.add('hidden')
  if (userSearch) {
    userSearch.value = ''
    userSearch.classList.add('hidden')
  }

  render()
  await loadUserHoldings(user.id)

  // Tab đang chọn lỡ là tab khách đã có (vd. đơn chờ của khách đã sở hữu) → bỏ.
  if (selectedSongId && ownedSongIds.has(selectedSongId)) {
    selectedSongId = null
    showToast('Khách này đã có tab đó rồi — hãy chọn tab khác', 'info')
  }
  render()
  refreshContext()
}

function clearUser() {
  selectedUser = null
  ownedSongIds = new Set()
  pendingSongIds = new Set()
  context = null
  userCard?.classList.add('hidden')
  userCard?.classList.remove('flex')
  if (userSearch) {
    userSearch.classList.remove('hidden')
    userSearch.value = ''
    userSearch.focus()
  }
  render()
}

// ----------------------------------------------------------------------------
// BƯỚC 2 — chọn tab
// ----------------------------------------------------------------------------
function renderSongs() {
  if (!songList) return

  const q = (songSearch?.value || '').toLowerCase().trim()
  const songs = paidSongs()
    .filter(
      (s) =>
        !q ||
        (s.title || '').toLowerCase().includes(q) ||
        (s.singer || '').toLowerCase().includes(q)
    )
    // Tab khách đang có đơn chờ lên đầu — thường chính là tab cần cấp.
    .sort((a, b) => Number(pendingSongIds.has(b.id)) - Number(pendingSongIds.has(a.id)))

  if (songs.length === 0) {
    songList.innerHTML = `<div class="p-6 text-center text-xs text-text-muted">${
      paidSongs().length === 0 ? 'Chưa có bài có phí nào trong kho.' : 'Không tìm thấy bài nào khớp.'
    }</div>`
    return
  }

  songList.innerHTML = songs
    .map((s) => {
      const owned = ownedSongIds.has(s.id)
      const pending = pendingSongIds.has(s.id) && !owned
      const on = selectedSongId === s.id
      return `
      <button type="button" data-song="${escapeHtml(s.id)}" ${owned ? 'disabled' : ''}
        class="w-full text-left flex items-center gap-3 p-3 transition-colors ${
          owned
            ? 'opacity-50 cursor-not-allowed'
            : on
              ? 'bg-accent-primary/10 cursor-pointer'
              : 'hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
        }">
        <span class="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          on ? 'border-accent-primary' : 'border-glass-border'
        }">${on ? '<span class="w-2 h-2 rounded-full bg-accent-primary"></span>' : ''}</span>
        <span class="flex-1 min-w-0">
          <span class="block text-xs font-bold text-text-primary truncate">${escapeHtml(s.title)}</span>
          <span class="block text-[11px] text-text-muted truncate">${escapeHtml(s.singer || '')}</span>
        </span>
        ${owned ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold whitespace-nowrap">Khách đã có</span>' : ''}
        ${pending ? '<span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold whitespace-nowrap">Có đơn chờ</span>' : ''}
        <span class="font-mono text-[11px] font-bold text-accent-primary flex-shrink-0">${s.price ? formatVnd(s.price) : 'Có phí'}</span>
      </button>`
    })
    .join('')

  songList.querySelectorAll('[data-song]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedSongId = btn.dataset.song
      render()
      refreshContext()
    })
  })
}

// ----------------------------------------------------------------------------
// BƯỚC 3 — lý do
// ----------------------------------------------------------------------------
function renderReasons() {
  if (!reasonList) return

  reasonList.innerHTML = REASONS.map((r) => {
    const on = selectedReason === r.value
    return `
      <button type="button" data-reason="${r.value}" role="radio" aria-checked="${on}"
        class="text-left p-3 rounded-xl border transition-colors cursor-pointer ${
          on
            ? 'border-accent-primary bg-accent-primary/10'
            : 'border-glass-border bg-black/[0.02] dark:bg-white/[0.03] hover:border-accent-primary/50'
        }">
        <span class="block text-xs font-bold text-text-primary">${escapeHtml(r.label)}</span>
        <span class="inline-flex items-center gap-1 mt-1 text-[10px] font-bold ${
          r.paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-muted'
        }">
          <span class="w-1.5 h-1.5 rounded-full ${r.paid ? 'bg-emerald-500' : 'bg-text-muted opacity-60'}"></span>
          ${escapeHtml(r.hint)}
        </span>
      </button>`
  }).join('')

  reasonList.querySelectorAll('[data-reason]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedReason = btn.dataset.reason
      render()
    })
  })
}

// ----------------------------------------------------------------------------
// Kiểm tra bối cảnh (đã sở hữu chưa, đơn chờ, số lần cấp tay)
// ----------------------------------------------------------------------------
async function refreshContext() {
  context = null
  if (!selectedUser || !selectedSongId) {
    renderSummary()
    return
  }

  const requestId = ++contextRequestId
  try {
    const { data, error } = await supabase.rpc('admin_check_grant_context', {
      p_user_id: selectedUser.id,
      p_song_id: selectedSongId,
    })
    if (error) throw error
    if (requestId !== contextRequestId) return
    context = data
  } catch (err) {
    console.error('Error checking grant context:', err)
    if (requestId !== contextRequestId) return
    context = null
  }
  renderSummary()
}

// ----------------------------------------------------------------------------
// Khung tóm tắt + nút cấp
// ----------------------------------------------------------------------------
function summaryRow(label, value, muted) {
  return `
    <div class="flex items-start justify-between gap-3 text-xs">
      <dt class="text-text-muted flex-shrink-0">${label}</dt>
      <dd class="text-right min-w-0 break-words ${muted ? 'text-text-muted' : 'font-bold text-text-primary'}">${value}</dd>
    </div>`
}

function renderSummary() {
  if (!summaryEl) return

  const song = findSong(selectedSongId)
  const reason = REASONS.find((r) => r.value === selectedReason)

  summaryEl.innerHTML =
    summaryRow(
      'Khách',
      selectedUser
        ? `${escapeHtml(selectedUser.full_name || 'Khách vãng lai')}<span class="block text-[10px] font-normal text-text-muted">${escapeHtml(selectedUser.email || '')}</span>`
        : 'Chưa chọn',
      !selectedUser
    ) +
    summaryRow(
      'Tab',
      song
        ? `${escapeHtml(song.title)}<span class="block text-[10px] font-mono font-normal text-accent-primary">${song.price ? formatVnd(song.price) : 'Có phí'}</span>`
        : 'Chưa chọn',
      !song
    ) +
    summaryRow('Lý do', reason ? escapeHtml(reason.label) : 'Chưa chọn', !reason)

  renderConsequences(song, reason)
  renderWarnings()
  renderSubmit(song, reason)
}

/** Danh sách "Sau khi cấp sẽ có gì" — chỉ hiện khi đã chọn đủ khách + tab. */
function renderConsequences(song, reason) {
  const box = document.getElementById('grant-consequences')
  if (!box) return

  if (!selectedUser || !song) {
    box.classList.add('hidden')
    box.innerHTML = ''
    return
  }

  const lines = []
  lines.push(
    `<li class="flex gap-2">${ICON_CHECK}<span>Tab <strong>${escapeHtml(song.title)}</strong> hiện trong thư viện của khách trên web.</span></li>`
  )

  if (hasDriveLink(song) && selectedUser.email) {
    lines.push(
      `<li class="flex gap-2">${ICON_CHECK}<span>File Drive được chia sẻ tự động cho <strong>${escapeHtml(selectedUser.email)}</strong>.</span></li>`
    )
  } else if (!selectedUser.email) {
    lines.push(
      `<li class="flex gap-2">${ICON_WARN}<span>Khách chưa có email nên <strong>không chia sẻ Drive được</strong> — chỉ mở tab trên web.</span></li>`
    )
  } else {
    lines.push(
      `<li class="flex gap-2">${ICON_WARN}<span>Bài này chưa có link Drive hợp lệ nên chỉ mở tab trên web.</span></li>`
    )
  }

  // Đơn chờ của đúng khách + đúng bài → server sẽ tự đóng đơn đó khi cấp. Nhận
  // ra qua danh sách đơn của khách (nạp khi chọn khách), hoặc qua kết quả kiểm
  // tra bối cảnh nếu danh sách đó chưa về kịp.
  const hasMatchingPending =
    pendingSongIds.has(song.id) ||
    (context?.pending_orders || []).some((p) => p.song_id === song.id || p.song_title === song.title)

  // Chỉ nói về doanh thu khi đã chọn lý do — trước đó chưa biết kết quả thế nào.
  if (reason) {
    if (hasMatchingPending) {
      lines.push(
        reason.paid
          ? `<li class="flex gap-2">${ICON_CHECK}<span>Đơn chờ của khách cho bài này được đóng thành <strong>đã thanh toán</strong> và tính vào doanh thu.</span></li>`
          : `<li class="flex gap-2">${ICON_CHECK}<span>Đơn chờ của khách cho bài này được đóng thành <strong>hết hạn</strong>, không tính doanh thu.</span></li>`
      )
    } else {
      lines.push(
        `<li class="flex gap-2">${ICON_CHECK}<span>Khách không có đơn chờ cho bài này nên <strong>không ghi thêm doanh thu</strong>.</span></li>`
      )
    }
  }

  box.innerHTML = `
    <div class="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Khi bấm cấp</div>
    <ul class="space-y-1.5 text-[11.5px] leading-relaxed text-text-primary">${lines.join('')}</ul>`
  box.classList.remove('hidden')
}

function warningBox(type, text) {
  const styles = {
    danger: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
  }
  return `<div class="px-3 py-2.5 rounded-xl border text-[11px] font-semibold leading-relaxed ${styles[type]}">${text}</div>`
}

function renderWarnings() {
  if (!warningsEl) return

  const boxes = []
  if (context?.already_owns) {
    boxes.push(
      warningBox('danger', 'Khách này đã có quyền xem tab đang chọn. Hệ thống sẽ từ chối — hãy chọn tab khác.')
    )
  }
  if ((context?.manual_grant_count || 0) >= 3) {
    boxes.push(
      warningBox(
        'warn',
        `Khách này đã được cấp tay ${context.manual_grant_count} lần trước đó — kiểm tra kỹ xem có bất thường không.`
      )
    )
  }

  warningsEl.innerHTML = boxes.join('')
  warningsEl.classList.toggle('hidden', boxes.length === 0)
}

function renderSubmit(song, reason) {
  if (!submitBtn) return

  const blocked = !!context?.already_owns
  const ready = !!(selectedUser && song && reason) && !blocked

  let label = 'Chọn khách để tiếp tục'
  if (selectedUser && !song) label = 'Chọn tab để tiếp tục'
  else if (selectedUser && song && !reason) label = 'Chọn lý do để tiếp tục'
  else if (blocked) label = 'Khách đã có tab này'
  else if (ready) label = `Cấp quyền cho ${selectedUser.full_name || 'khách'}`

  submitBtn.disabled = !ready
  const labelEl = submitBtn.querySelector('[data-label]')
  if (labelEl) labelEl.textContent = label
}

function render() {
  renderSongs()
  renderReasons()
  renderSummary()
}

// ----------------------------------------------------------------------------
// Gửi yêu cầu cấp quyền
// ----------------------------------------------------------------------------
function resetForm() {
  selectedUser = null
  selectedSongId = null
  selectedReason = null
  context = null
  ownedSongIds = new Set()
  pendingSongIds = new Set()
  if (noteInput) noteInput.value = ''
  if (songSearch) songSearch.value = ''
  userCard?.classList.add('hidden')
  userCard?.classList.remove('flex')
  if (userSearch) {
    userSearch.classList.remove('hidden')
    userSearch.value = ''
  }
  render()
}

function showResult({ userId, userNameText, songTitle, driveGranted, closedStatus }) {
  if (!resultEl) return

  const closedText =
    closedStatus === 'paid'
      ? ' Đơn chờ tương ứng đã được đánh dấu đã thanh toán.'
      : closedStatus === 'expired'
        ? ' Đơn chờ tương ứng đã được đánh dấu hết hạn.'
        : ''

  resultEl.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      </div>
      <div class="min-w-0 text-xs leading-relaxed">
        <div class="font-extrabold text-text-primary">Đã cấp quyền thành công</div>
        <div class="text-text-muted mt-0.5"><strong class="text-text-primary">${escapeHtml(songTitle)}</strong> cho <strong class="text-text-primary">${escapeHtml(userNameText)}</strong>.${closedText}</div>
        <div class="mt-1 font-semibold ${driveGranted ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
          ${driveGranted ? 'Đã chia sẻ file Drive cho email của khách.' : 'Chưa chia sẻ được Drive tự động — bạn cần vào Drive chia sẻ tay.'}
        </div>
        <button type="button" data-open-user="${escapeHtml(userId)}" class="mt-2 text-[11px] font-bold text-accent-primary hover:underline cursor-pointer">Xem hồ sơ khách →</button>
      </div>
    </div>`
  resultEl.classList.remove('hidden')
  resultEl.querySelector('[data-open-user]')?.addEventListener('click', (e) => {
    navigate('thanh-vien-chi-tiet', e.currentTarget.dataset.openUser)
  })
}

async function submitGrant(e) {
  e.preventDefault()
  if (!selectedUser || !selectedSongId || !selectedReason) return

  const song = findSong(selectedSongId)
  const snapshot = {
    userId: selectedUser.id,
    userNameText: selectedUser.full_name || selectedUser.email || 'khách',
    songTitle: song?.title || selectedSongId,
  }
  const note = noteInput?.value?.trim() || null

  submitBtn.disabled = true
  const labelEl = submitBtn.querySelector('[data-label]')
  if (labelEl) labelEl.textContent = 'Đang cấp quyền…'

  try {
    // Gọi Edge Function thay vì thẳng RPC — hàm này vừa ghi vào DB (qua đúng
    // RPC admin_grant_access, kèm lý do/ghi chú và tự đóng đơn treo) vừa tự
    // động gọi Apps Script cấp quyền xem file Google Drive cho email khách.
    const { data, error } = await supabase.functions.invoke('admin-grant-access', {
      body: { userId: snapshot.userId, songId: selectedSongId, reason: selectedReason, note },
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Lỗi khi cấp quyền')

    resetForm()
    showResult({
      ...snapshot,
      driveGranted: !!data.driveGranted,
      closedStatus: data.dbResult?.closed_order_status,
    })
    showToast(
      data.driveGranted
        ? '✓ Đã cấp quyền xem tab + quyền Google Drive'
        : '✓ Đã cấp quyền xem tab — Drive cần chia sẻ tay',
      data.driveGranted ? 'success' : 'error'
    )

    await Promise.all([loadUsers(), loadPendingOrders()])
  } catch (err) {
    console.error(err)
    showToast('❌ ' + (err.message || 'Lỗi khi cấp quyền'), 'error')
    renderSubmit(findSong(selectedSongId), REASONS.find((r) => r.value === selectedReason))
  }
}

// ----------------------------------------------------------------------------
// Vào trang / khởi tạo
// ----------------------------------------------------------------------------

/** Router gọi mỗi lần vào #/cap-quyen. */
export async function enterGrantPage() {
  const prefill = state.grantPrefill
  state.grantPrefill = null

  if (state.songsList.length === 0) await loadSongs()
  if (state.usersList.length === 0) await loadUsers()

  if (prefill) {
    // Đến từ đơn chờ / hồ sơ thành viên → bắt đầu lại, không dính lựa chọn cũ.
    resetForm()
    selectedSongId = prefill.songId || null
    selectedReason = prefill.reason || null
    if (noteInput) noteInput.value = prefill.note || ''

    const user = state.usersList.find((u) => u.id === prefill.userId)
    if (user) {
      await selectUser(user)
    } else {
      showToast('Không tìm thấy khách này trong danh sách thành viên', 'error')
      render()
    }
    return
  }

  render()
}

export function initGrantSection() {
  form?.addEventListener('submit', submitGrant)
  userClear?.addEventListener('click', clearUser)
  songSearch?.addEventListener('input', renderSongs)

  userSearch?.addEventListener('input', () => {
    const matches = matchingUsers(userSearch.value)
    if (!userSearch.value.trim()) {
      userResults?.classList.add('hidden')
      return
    }
    renderUserResults(matches)
  })

  // Enter trong ô tìm khách chọn luôn kết quả đầu tiên (không gửi form).
  userSearch?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const first = matchingUsers(userSearch.value)[0]
    if (first) selectUser(first)
  })

  // Bấm ra ngoài thì đóng danh sách gợi ý.
  document.addEventListener('click', (e) => {
    if (!userResults || userResults.classList.contains('hidden')) return
    if (e.target === userSearch || userResults.contains(e.target)) return
    userResults.classList.add('hidden')
  })

  render()
}
