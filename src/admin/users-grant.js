/**
 * ==============================================================================
 * ADMIN DASHBOARD — USERS & ACCESS GRANT (ORDERS) LOGIC
 * ==============================================================================
 * Tách từ admin-dashboard.js. Xem ghi chú tương tự trong songs.js.
 * `selectUserForGrant` gọi `switchTab('grant')` qua tên trần (window.switchTab
 * được gán trong admin-dashboard.js chính) — an toàn vì initDashboard() luôn
 * chạy trước khi người dùng có thể click nút "Cấp quyền" trên bảng user.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { updateOrdersBadge } from './overview.js'

const statTotalUsers = document.getElementById('stat-total-users')
const adminUsersTbody = document.getElementById('users-tbody')
const adminSearchUsers = document.getElementById('admin-search-users')
const adminSortUsers = document.getElementById('admin-sort-users')

const grantAccessForm = document.getElementById('grant-access-form')
const grantSongSelect = document.getElementById('grant-song-select')
const grantUserIdInput = document.getElementById('grant-user-id')
const grantUserSearch = document.getElementById('grant-user-search')
const grantUserResults = document.getElementById('grant-user-results')
const grantUserCard = document.getElementById('grant-user-card')
const grantUserAvatar = document.getElementById('grant-user-avatar')
const grantUserName = document.getElementById('grant-user-name')
const grantUserEmail = document.getElementById('grant-user-email')
const grantUserMeta = document.getElementById('grant-user-meta')
const grantUserClear = document.getElementById('grant-user-clear')
const grantWarnings = document.getElementById('grant-warnings')
const grantReason = document.getElementById('grant-reason')
const grantReasonHint = document.getElementById('grant-reason-hint')
const grantNote = document.getElementById('grant-note')
const recentGrantsTbody = document.getElementById('recent-grants-tbody')
const refreshHistoryBtn = document.getElementById('refresh-history-btn')
const grantsFilter = document.getElementById('grants-filter')
const pendingOrdersList = document.getElementById('pending-orders-list')
const pendingCountBadge = document.getElementById('pending-count-badge')
const pendingSearch = document.getElementById('pending-search')
const refreshPendingBtn = document.getElementById('refresh-pending-btn')
const expireStaleBtn = document.getElementById('expire-stale-btn')

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function loadUsers() {
  try {
    const { data, error } = await supabase.rpc('admin_get_users')
    if (error) throw error
    state.usersList = data || []
    if (statTotalUsers) statTotalUsers.textContent = state.usersList.length
    renderUsersTable()
  } catch (err) {
    console.error('Error loading users:', err)
    showToast('Lỗi khi tải danh sách người dùng: ' + err.message, 'error')
  }
}

function renderUsersTable() {
  if (!adminUsersTbody) return
  adminUsersTbody.innerHTML = ''

  let filtered = [...state.usersList]

  // Filter Search Query
  const q = state.userSearchQuery.toLowerCase().trim()
  if (q) {
    filtered = filtered.filter(
      (u) =>
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q))
    )
  }

  // Sorting
  if (state.userSortBy === 'newest') {
    filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  } else if (state.userSortBy === 'oldest') {
    filtered.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  } else if (state.userSortBy === 'purchases_desc') {
    filtered.sort((a, b) => (b.purchases_count || 0) - (a.purchases_count || 0))
  } else if (state.userSortBy === 'name_asc') {
    filtered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
  }

  if (filtered.length === 0) {
    adminUsersTbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-xs text-text-muted">Không tìm thấy người dùng nào phù hợp.</td></tr>`
    return
  }

  filtered.forEach((u) => {
    const isSelf = state.currentAdminId && u.id === state.currentAdminId
    const isVip = u.purchases_count > 0 || u.role === 'admin'
    const roleBadge =
      u.role === 'admin'
        ? `<span class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider border border-rose-500/30">ADMIN</span>`
        : isVip
          ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30 shadow-glow">VIP Member</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-glass-border text-text-muted text-[10px] font-medium">Free</span>`

    // Short UUID format: a1b2c3d4...9f8e
    const uuidStr = String(u.id || '')
    const shortUuid =
      uuidStr.length > 12 ? `${uuidStr.slice(0, 8)}...${uuidStr.slice(-4)}` : uuidStr

    const tr = document.createElement('tr')
    tr.className =
      'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/50 last:border-0 admin-user-card-row'
    tr.innerHTML = `
      <td data-label="Thành viên" class="p-3 sm:p-4 user-col-profile">
        <div class="flex items-center gap-3 w-full">
          <img src="${u.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.full_name || u.email || 'User') + '&background=random'}" alt="Avatar" class="w-10 h-10 rounded-xl border border-glass-border object-cover bg-glass-bg flex-shrink-0">
          <div class="flex-1 min-w-0 text-left">
            <div class="text-xs sm:text-sm font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
              <span class="truncate max-w-[140px] sm:max-w-none">${escapeHtml(u.full_name || 'Khách Vãng Lai')}</span>
              ${isSelf ? '<span class="text-[10px] text-accent-primary font-bold">(Bạn)</span>' : ''}
              <div class="sm:hidden ml-auto">${roleBadge}</div>
            </div>
            <div class="text-[11px] sm:text-xs text-text-muted font-medium truncate">${escapeHtml(u.email || 'Chưa cập nhật email')}</div>
          </div>
        </div>
      </td>
      <td data-label="Mã User (UUID)" class="p-3 sm:p-4 user-col-uuid">
        <div class="flex items-center justify-between sm:justify-start gap-1.5 w-full">
          <span class="text-[11px] font-bold text-text-muted sm:hidden">Mã UUID:</span>
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-[11px] sm:text-xs text-accent-primary bg-black/5 dark:bg-white/5 px-2 py-0.5 sm:py-1 rounded-lg border border-glass-border cursor-help" title="${escapeHtml(uuidStr)}">
              ${shortUuid}
            </span>
            <button onclick="copyUserId('${escapeHtml(uuidStr)}')" class="p-1 sm:p-1.5 rounded-lg bg-glass-bg border border-glass-border hover:bg-glass-bg-hover hover:border-accent-primary text-text-muted hover:text-accent-primary transition-all cursor-pointer" title="Copy UUID">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
        </div>
      </td>
      <td data-label="Vai trò" class="p-3 sm:p-4 text-center user-col-role">
        ${roleBadge}
      </td>
      <td data-label="Đã mua" class="p-3 sm:p-4 text-center user-col-stats">
        <div class="flex items-center justify-between sm:justify-center w-full">
          <span class="text-[11px] font-bold text-text-muted sm:hidden">Hoạt động:</span>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1 text-xs font-mono font-bold ${u.purchases_count > 0 ? 'text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20' : 'text-text-muted'}" title="Đã mua">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4.5 14h6L9 22l10-13h-6.5L13 2z"/></svg>${u.purchases_count || 0} bài
            </span>
            <span class="inline-flex items-center gap-1 text-xs font-mono font-bold ${u.favorites_count > 0 ? 'text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20' : 'text-text-muted'}" title="Yêu thích">
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.25c-4.5-2.7-9-6.44-9-10.5C3 6.5 5.5 4 8.25 4c1.6 0 3 .8 3.75 2.1C12.75 4.8 14.15 4 15.75 4 18.5 4 21 6.5 21 9.75c0 4.06-4.5 7.8-9 10.5z"/></svg>${u.favorites_count || 0}
            </span>
          </div>
        </div>
      </td>
      <td data-label="Yêu thích" class="p-3 sm:p-4 text-center user-col-favorites hidden sm:table-cell">
        <span class="text-xs font-mono font-bold ${u.favorites_count > 0 ? 'text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20' : 'text-text-muted'}">
          ${u.favorites_count || 0}
        </span>
      </td>
      <td data-label="Ngày đăng ký" class="p-3 sm:p-4 text-[11px] text-text-muted font-medium user-col-date">
        <div class="flex items-center justify-between sm:justify-start w-full">
          <span class="text-[11px] font-bold text-text-muted sm:hidden">Đăng ký:</span>
          <span>${u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}</span>
        </div>
      </td>
      <td data-label="Thao tác" class="p-3 sm:p-4 text-right user-col-actions">
        <div class="flex items-center justify-end gap-1.5 w-full">
          <button onclick="selectUserForGrant('${escapeHtml(uuidStr)}')" class="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg sm:rounded-xl bg-warm-gradient hover:brightness-105 text-white text-xs font-bold transition-all shadow-xs text-center cursor-pointer active:scale-95" title="Cấp quyền tab cho user này">
            Cấp quyền
          </button>
          ${
            isSelf
              ? `<button disabled class="p-2 rounded-lg sm:rounded-xl bg-black/5 dark:bg-white/5 text-text-muted opacity-30 cursor-not-allowed" title="Không thể xoá tài khoản của chính mình">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>`
              : `<button onclick="confirmDeleteUser('${escapeHtml(uuidStr)}', '${escapeHtml(u.full_name || 'Khách')}', '${escapeHtml(u.email || '')}')" class="p-2 rounded-lg sm:rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 transition-all cursor-pointer active:scale-95" title="Xoá vĩnh viễn tài khoản">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
               </button>`
          }
        </div>
      </td>
    `
    adminUsersTbody.appendChild(tr)
  })
}

window.copyUserId = function (id) {
  navigator.clipboard.writeText(id)
  showToast('✓ Đã copy toàn bộ UUID: ' + id, 'success')
}

/** Nút "Cấp quyền" trên bảng người dùng — nhảy sang tab Đơn Hàng và chọn sẵn
 *  đúng khách đó (hiện thẻ xác nhận tên/email), chỉ còn thiếu bước chọn bài. */
window.selectUserForGrant = function (id) {
  window.switchTab('grant')
  const user = state.usersList.find((u) => u.id === id)
  if (user) {
    selectUser(user)
    showToast(`✓ Đã chọn ${user.full_name || user.email} — giờ chọn bài cần mở khoá`, 'info')
  } else if (grantUserIdInput) {
    grantUserIdInput.value = id
  }
  grantSongSelect?.focus()
}

window.confirmDeleteUser = async function (id, name, email) {
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

// ============================================================================
// CẤP QUYỀN THỦ CÔNG
// ============================================================================
// Luồng: tra đơn chưa hoàn tất (hoặc tự tìm khách theo tên/email) → chọn bài →
// hệ thống tự kiểm tra và cảnh báo (đã sở hữu chưa, có đơn treo nào không, đã
// được cấp tay bao nhiêu lần) → chọn lý do → cấp. Không còn thao tác dán UUID
// vì nhìn vào chuỗi UUID không biết là ai, dán nhầm 1 ký tự là cấp nhầm người.

const REASON_LABELS = {
  bank_wrong_note: 'Chuyển khoản sai nội dung',
  offline_payment: 'Thanh toán ngoài SePay',
  gift: 'Tặng / khuyến mãi',
  compensation: 'Đền bù lỗi',
  other: 'Lý do khác',
}

// Hai lý do này nghĩa là ĐÃ nhận được tiền → đơn treo tương ứng sẽ được đánh
// dấu "đã thanh toán"; các lý do còn lại đánh dấu "hết hạn" để doanh thu không
// bị thổi phồng bởi những lần tặng/đền bù.
const PAID_REASONS = ['bank_wrong_note', 'offline_payment']

let pendingOrders = []

function avatarUrlFor(user) {
  return (
    user.avatar_url ||
    'https://ui-avatars.com/api/?name=' +
      encodeURIComponent(user.full_name || user.email || 'User') +
      '&background=random'
  )
}

function formatVnd(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ'
}

function formatAge(minutes) {
  const m = Number(minutes) || 0
  if (m < 60) return `${m} phút trước`
  if (m < 60 * 24) return `${Math.floor(m / 60)} giờ trước`
  return `${Math.floor(m / 60 / 24)} ngày trước`
}

// ----------------------------------------------------------------------------
// Đổ danh sách bài trả phí vào dropdown chọn bài
// ----------------------------------------------------------------------------
export function renderPaidSongs() {
  if (!grantSongSelect) return
  const paidSongs = state.songsList.filter((s) => !s.is_free)
  const current = grantSongSelect.value

  grantSongSelect.innerHTML = '<option value="">-- Chọn bài hát cần cấp quyền --</option>'
  paidSongs.forEach((s) => {
    const opt = document.createElement('option')
    opt.value = s.id
    opt.textContent = `${s.title}${s.singer ? ' - ' + s.singer : ''} (${s.price || 'Có phí'})`
    grantSongSelect.appendChild(opt)
  })

  if (current) grantSongSelect.value = current
}

// ----------------------------------------------------------------------------
// KHỐI 1: hàng đợi đơn chưa hoàn tất
// ----------------------------------------------------------------------------
export async function loadPendingOrders() {
  if (!pendingOrdersList) return
  pendingOrdersList.innerHTML = `<div class="p-6 text-center text-xs text-text-muted">Đang tải…</div>`

  try {
    const { data, error } = await supabase.rpc('admin_get_pending_orders')
    if (error) throw error
    pendingOrders = data || []
    updateOrdersBadge(pendingOrders.length)
    renderPendingOrders()
  } catch (err) {
    console.error('Error loading pending orders:', err)
    pendingOrdersList.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Lỗi khi tải đơn: ${escapeHtml(err.message)}</div>`
  }
}

function renderPendingOrders() {
  if (!pendingOrdersList) return

  const q = (pendingSearch?.value || '').toLowerCase().trim()
  const filtered = q
    ? pendingOrders.filter(
        (o) =>
          (o.order_code || '').toLowerCase().includes(q) ||
          (o.user_name || '').toLowerCase().includes(q) ||
          (o.user_email || '').toLowerCase().includes(q) ||
          (o.song_title || '').toLowerCase().includes(q)
      )
    : pendingOrders

  if (pendingCountBadge) pendingCountBadge.textContent = String(pendingOrders.length)
  pendingOrdersList.innerHTML = ''

  if (filtered.length === 0) {
    pendingOrdersList.innerHTML = `<div class="p-6 text-center text-xs text-text-muted">${
      pendingOrders.length === 0
        ? 'Không có đơn nào đang chờ — tất cả đã được xử lý.'
        : 'Không tìm thấy đơn nào khớp từ khoá.'
    }</div>`
    return
  }

  filtered.forEach((o) => {
    const row = document.createElement('div')
    row.className = 'p-3.5 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors'
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono font-black text-xs text-text-primary">${escapeHtml(o.order_code)}</span>
          <span class="text-[10px] text-text-muted">${formatAge(o.age_minutes)}</span>
          ${o.is_hssv ? '<span class="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[9px] font-black uppercase">HSSV</span>' : ''}
          ${o.already_owns ? '<span class="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase">Đã có tab</span>' : ''}
        </div>
        <div class="text-xs font-bold text-text-primary truncate mt-0.5">${escapeHtml(o.user_name)} <span class="text-text-muted font-normal">· ${escapeHtml(o.user_email || 'chưa có email')}</span></div>
        <div class="text-[11px] text-text-muted truncate">${escapeHtml(o.song_title)} — <span class="font-mono font-bold text-accent-primary">${formatVnd(o.amount)}</span></div>
      </div>
      <button type="button" data-order-user="${escapeHtml(o.user_id)}" data-order-song="${escapeHtml(o.song_id)}"
        class="pending-grant-btn px-3.5 py-2 rounded-xl ${o.already_owns ? 'bg-black/5 dark:bg-white/10 text-text-muted' : 'bg-warm-gradient text-white'} text-[11px] font-bold cursor-pointer active:scale-95 transition-all flex-shrink-0 whitespace-nowrap">
        ${o.already_owns ? 'Xem lại' : 'Cấp quyền →'}
      </button>
    `
    pendingOrdersList.appendChild(row)
  })

  pendingOrdersList.querySelectorAll('.pending-grant-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      prefillGrantFromOrder(btn.dataset.orderUser, btn.dataset.orderSong)
    })
  })
}

/** Nạp sẵn đúng khách + đúng bài của một đơn vào form cấp quyền bên dưới. */
function prefillGrantFromOrder(userId, songId) {
  const user = state.usersList.find((u) => u.id === userId)
  if (user) {
    selectUser(user)
  } else {
    // Danh sách user chưa tải kịp (admin vào thẳng tab Đơn Hàng) — vẫn gán id
    // để cấp được, và tải danh sách ngầm để lần sau hiện đủ tên/email.
    if (grantUserIdInput) grantUserIdInput.value = userId
    loadUsers().then(() => {
      const u = state.usersList.find((x) => x.id === userId)
      if (u) selectUser(u)
    })
  }

  if (grantSongSelect) grantSongSelect.value = songId
  if (grantReason) grantReason.value = 'bank_wrong_note'
  updateReasonHint()
  refreshGrantContext()

  grantAccessForm?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  showToast('✓ Đã nạp thông tin đơn vào form — kiểm tra rồi bấm Xác Nhận', 'info')
}

// ----------------------------------------------------------------------------
// KHỐI 2: chọn khách bằng tìm kiếm (thay cho dán UUID)
// ----------------------------------------------------------------------------
function renderUserResults(list) {
  if (!grantUserResults) return

  if (list.length === 0) {
    grantUserResults.innerHTML = `<div class="p-3 text-xs text-text-muted text-center">Không tìm thấy thành viên nào.</div>`
    grantUserResults.classList.remove('hidden')
    return
  }

  grantUserResults.innerHTML = ''
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
      <span class="text-[10px] font-mono text-text-muted flex-shrink-0">${u.purchases_count || 0} tab</span>
    `
    item.addEventListener('click', () => selectUser(u))
    grantUserResults.appendChild(item)
  })
  grantUserResults.classList.remove('hidden')
}

function selectUser(user) {
  if (grantUserIdInput) grantUserIdInput.value = user.id
  if (grantUserAvatar) grantUserAvatar.src = avatarUrlFor(user)
  if (grantUserName) grantUserName.textContent = user.full_name || 'Khách vãng lai'
  if (grantUserEmail) grantUserEmail.textContent = user.email || 'Chưa có email'
  if (grantUserMeta)
    grantUserMeta.textContent = `Đang sở hữu ${user.purchases_count || 0} tab · ${String(user.id).slice(0, 8)}…`
  grantUserCard?.classList.remove('hidden')
  grantUserCard?.classList.add('flex')
  grantUserResults?.classList.add('hidden')
  if (grantUserSearch) {
    grantUserSearch.value = ''
    grantUserSearch.classList.add('hidden')
  }
  refreshGrantContext()
}

function clearSelectedUser() {
  if (grantUserIdInput) grantUserIdInput.value = ''
  grantUserCard?.classList.add('hidden')
  grantUserCard?.classList.remove('flex')
  if (grantUserSearch) {
    grantUserSearch.classList.remove('hidden')
    grantUserSearch.value = ''
    grantUserSearch.focus()
  }
  renderWarnings(null)
}

// ----------------------------------------------------------------------------
// Cảnh báo thông minh trước khi cấp
// ----------------------------------------------------------------------------
function warningBox(type, text) {
  const styles = {
    danger: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    info: 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400',
  }
  return `<div class="px-3.5 py-2.5 rounded-xl border text-[11px] font-semibold leading-relaxed ${styles[type]}">${text}</div>`
}

function renderWarnings(ctx) {
  if (!grantWarnings) return

  if (!ctx) {
    grantWarnings.innerHTML = ''
    grantWarnings.classList.add('hidden')
    return
  }

  const boxes = []

  if (ctx.already_owns) {
    boxes.push(
      warningBox(
        'danger',
        '⛔ Khách này ĐÃ có quyền xem bài hát đang chọn. Cấp lại sẽ bị hệ thống từ chối — hãy chọn bài khác.'
      )
    )
  }

  const pending = ctx.pending_orders || []
  if (pending.length > 0) {
    const items = pending
      .slice(0, 3)
      .map(
        (p) =>
          `<li>• <span class="font-mono">${escapeHtml(p.order_code)}</span> — ${escapeHtml(p.song_title)} (${formatVnd(p.amount)})</li>`
      )
      .join('')
    boxes.push(
      warningBox(
        'info',
        `📄 Khách đang có ${pending.length} đơn chưa hoàn tất:<ul class="mt-1 space-y-0.5 font-normal">${items}</ul><span class="font-normal">Đơn khớp đúng bài đang chọn sẽ được tự động đóng lại sau khi cấp.</span>`
      )
    )
  }

  if ((ctx.manual_grant_count || 0) >= 3) {
    boxes.push(
      warningBox(
        'warn',
        `⚠️ Khách này đã được cấp tay ${ctx.manual_grant_count} lần trước đó — kiểm tra kỹ xem có bất thường không.`
      )
    )
  }

  if (boxes.length === 0) {
    grantWarnings.innerHTML = ''
    grantWarnings.classList.add('hidden')
    return
  }

  grantWarnings.innerHTML = boxes.join('')
  grantWarnings.classList.remove('hidden')
}

async function refreshGrantContext() {
  const userId = grantUserIdInput?.value
  const songId = grantSongSelect?.value
  if (!userId || !songId) {
    renderWarnings(null)
    return
  }

  try {
    const { data, error } = await supabase.rpc('admin_check_grant_context', {
      p_user_id: userId,
      p_song_id: songId,
    })
    if (error) throw error
    renderWarnings(data)
  } catch (err) {
    console.error('Error checking grant context:', err)
    renderWarnings(null)
  }
}

function updateReasonHint() {
  if (!grantReasonHint || !grantReason) return
  const isPaid = PAID_REASONS.includes(grantReason.value)
  grantReasonHint.textContent = isPaid
    ? 'Lý do này nghĩa là đã nhận được tiền → đơn đang chờ tương ứng sẽ được đánh dấu "đã thanh toán" và tính vào doanh thu.'
    : 'Lý do này nghĩa là không thu tiền → đơn đang chờ tương ứng sẽ được đánh dấu "hết hạn", không tính vào doanh thu.'
}

// ----------------------------------------------------------------------------
// KHỐI 3: lịch sử mở khoá tab + thu hồi
// ----------------------------------------------------------------------------
export async function loadRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-text-muted text-xs">Đang tải lịch sử…</td></tr>`

  try {
    const { data, error } = await supabase.rpc('admin_get_recent_purchases')
    if (error) throw error
    state.recentGrantsList = data || []
    renderRecentGrants()
  } catch (err) {
    console.error('Error loading recent grants:', err)
    recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-500 text-xs">Lỗi khi tải lịch sử.</td></tr>`
  }
}

function renderRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = ''

  const filter = grantsFilter?.value || 'all'
  const list = state.recentGrantsList.filter((r) => {
    if (filter === 'manual') return r.is_manual
    if (filter === 'auto') return !r.is_manual
    return true
  })

  if (list.length === 0) {
    recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-text-muted text-xs">Chưa có lượt mở khoá nào phù hợp.</td></tr>`
    return
  }

  list.forEach((r) => {
    const sourceBadge = r.is_manual
      ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold">Cấp tay</span>`
      : `<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">Tự động</span>`

    const detail = r.is_manual
      ? `<div class="text-[10px] text-text-muted mt-1 leading-relaxed">
           ${escapeHtml(REASON_LABELS[r.grant_reason] || r.grant_reason || 'Không rõ lý do')}
           ${r.granted_by_name ? ` · bởi ${escapeHtml(r.granted_by_name)}` : ''}
           ${r.grant_note ? `<br><span class="italic">“${escapeHtml(r.grant_note)}”</span>` : ''}
         </div>`
      : ''

    const tr = document.createElement('tr')
    tr.className =
      'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/40 last:border-0'
    tr.innerHTML = `
      <td data-label="Thành viên" class="p-3">
        <div class="font-bold text-text-primary">${escapeHtml(r.user_name || 'Học viên')}</div>
        <div class="text-[10px] text-text-muted">${escapeHtml(r.user_email || r.user_id)}</div>
      </td>
      <td data-label="Bài hát" class="p-3">
        <span class="font-bold text-accent-primary">${escapeHtml(r.song_title || r.song_id)}</span>
      </td>
      <td data-label="Nguồn" class="p-3">${sourceBadge}${detail}</td>
      <td data-label="Thời gian" class="p-3 text-right text-[11px] text-text-muted font-mono">
        ${r.purchased_at ? new Date(r.purchased_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
      </td>
      <td data-label="Thao tác" class="p-3 text-right">
        <button type="button" data-revoke-user="${escapeHtml(r.user_id)}" data-revoke-song="${escapeHtml(r.song_id)}"
          data-revoke-name="${escapeHtml(r.user_name || '')}" data-revoke-title="${escapeHtml(r.song_title || r.song_id)}"
          class="revoke-btn px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 text-[10px] font-bold cursor-pointer transition-colors">
          Thu hồi
        </button>
      </td>
    `
    recentGrantsTbody.appendChild(tr)
  })

  recentGrantsTbody.querySelectorAll('.revoke-btn').forEach((btn) => {
    btn.addEventListener('click', () =>
      handleRevoke(
        btn.dataset.revokeUser,
        btn.dataset.revokeSong,
        btn.dataset.revokeName,
        btn.dataset.revokeTitle
      )
    )
  })
}

async function handleRevoke(userId, songId, userName, songTitle) {
  const ok = confirm(
    `⚠️ THU HỒI QUYỀN XEM TAB\n\n` +
      `Thành viên: ${userName || userId}\n` +
      `Bài hát: ${songTitle}\n\n` +
      `Sau khi thu hồi, tab này sẽ biến mất khỏi thư viện của khách trên web.\n` +
      `LƯU Ý: quyền xem file trên Google Drive KHÔNG tự gỡ — nếu cần, bạn phải vào Drive bỏ chia sẻ email đó thủ công.\n\n` +
      `Bấm OK để xác nhận thu hồi.`
  )
  if (!ok) return

  try {
    const { error } = await supabase.rpc('admin_revoke_access', {
      p_user_id: userId,
      p_song_id: songId,
    })
    if (error) throw error
    showToast('✓ Đã thu hồi quyền xem tab (nhớ gỡ chia sẻ trên Drive nếu cần)', 'success')
    await Promise.all([loadRecentGrants(), loadUsers()])
  } catch (err) {
    console.error(err)
    showToast('❌ ' + (err.message || 'Lỗi khi thu hồi quyền'), 'error')
  }
}

// ----------------------------------------------------------------------------
// Submit form cấp quyền
// ----------------------------------------------------------------------------
if (grantAccessForm) {
  grantAccessForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const userId = grantUserIdInput?.value?.trim()
    const songId = grantSongSelect?.value
    const reason = grantReason?.value || 'other'
    const note = grantNote?.value?.trim() || null

    if (!userId) {
      showToast('⚠️ Vui lòng chọn khách hàng cần cấp quyền!', 'error')
      grantUserSearch?.focus()
      return
    }
    if (!songId) {
      showToast('⚠️ Vui lòng chọn bài hát cần mở khoá!', 'error')
      grantSongSelect?.focus()
      return
    }

    const submitBtn = document.getElementById('grant-submit-btn')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Đang xử lý...'
    }

    try {
      // Gọi Edge Function thay vì thẳng RPC — hàm này vừa ghi vào DB (qua đúng
      // RPC admin_grant_access, kèm lý do/ghi chú và tự đóng đơn treo) vừa tự
      // động gọi Apps Script cấp quyền xem file Google Drive cho email khách.
      const { data, error } = await supabase.functions.invoke('admin-grant-access', {
        body: { userId, songId, reason, note },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Lỗi khi cấp quyền')

      const closed = data.dbResult?.closed_order_status
      const closedMsg =
        closed === 'paid'
          ? ' Đơn chờ tương ứng đã được đánh dấu ĐÃ THANH TOÁN.'
          : closed === 'expired'
            ? ' Đơn chờ tương ứng đã được đánh dấu hết hạn.'
            : ''

      if (data.driveGranted) {
        showToast('✓ Đã cấp quyền xem Tab + quyền Google Drive!' + closedMsg, 'success')
      } else {
        showToast(
          '✓ Đã cấp quyền xem Tab, nhưng cấp quyền Drive tự động thất bại — cần tự chia sẻ Drive thủ công!' +
            closedMsg,
          'error'
        )
      }

      clearSelectedUser()
      if (grantSongSelect) grantSongSelect.value = ''
      if (grantNote) grantNote.value = ''
      renderWarnings(null)

      await Promise.all([loadUsers(), loadRecentGrants(), loadPendingOrders()])
    } catch (err) {
      console.error(err)
      showToast('❌ ' + (err.message || 'Lỗi khi cấp quyền'), 'error')
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.innerHTML =
          '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4.5 14h6L9 22l10-13h-6.5L13 2z"/></svg><span>Xác Nhận Cấp Quyền</span>'
      }
    }
  })
}

export function initUsersGrantSection() {
  if (adminSearchUsers) {
    adminSearchUsers.addEventListener('input', (e) => {
      state.userSearchQuery = e.target.value
      renderUsersTable()
    })
  }

  if (adminSortUsers) {
    adminSortUsers.addEventListener('change', (e) => {
      state.userSortBy = e.target.value
      renderUsersTable()
    })
  }

  if (refreshHistoryBtn) refreshHistoryBtn.addEventListener('click', () => loadRecentGrants())
  if (grantsFilter) grantsFilter.addEventListener('change', () => renderRecentGrants())
  if (refreshPendingBtn) refreshPendingBtn.addEventListener('click', () => loadPendingOrders())
  if (pendingSearch) pendingSearch.addEventListener('input', () => renderPendingOrders())

  if (expireStaleBtn) {
    expireStaleBtn.addEventListener('click', async () => {
      if (!confirm('Đánh dấu HẾT HẠN cho mọi đơn chưa hoàn tất được tạo quá 3 ngày trước?')) return
      try {
        const { data, error } = await supabase.rpc('admin_expire_stale_orders', { p_days: 3 })
        if (error) throw error
        showToast(`✓ Đã dọn ${data?.expired_count || 0} đơn quá hạn`, 'success')
        await loadPendingOrders()
      } catch (err) {
        showToast('❌ ' + (err.message || 'Lỗi khi dọn đơn'), 'error')
      }
    })
  }

  if (grantUserSearch) {
    grantUserSearch.addEventListener('input', () => {
      const q = grantUserSearch.value.toLowerCase().trim()
      if (!q) {
        grantUserResults?.classList.add('hidden')
        return
      }
      const matches = state.usersList.filter(
        (u) =>
          (u.full_name && u.full_name.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
      )
      renderUserResults(matches)
    })

    // Bấm ra ngoài thì đóng danh sách gợi ý
    document.addEventListener('click', (e) => {
      if (!grantUserResults || grantUserResults.classList.contains('hidden')) return
      if (e.target === grantUserSearch || grantUserResults.contains(e.target)) return
      grantUserResults.classList.add('hidden')
    })
  }

  if (grantUserClear) grantUserClear.addEventListener('click', clearSelectedUser)
  if (grantSongSelect) grantSongSelect.addEventListener('change', () => refreshGrantContext())
  if (grantReason) grantReason.addEventListener('change', updateReasonHint)

  updateReasonHint()
}
