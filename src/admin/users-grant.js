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

const statTotalUsers = document.getElementById('stat-total-users')
const adminUsersTbody = document.getElementById('users-tbody')
const adminSearchUsers = document.getElementById('admin-search-users')
const adminSortUsers = document.getElementById('admin-sort-users')

const grantAccessForm = document.getElementById('grant-access-form')
const grantSongSelect = document.getElementById('grant-song-select')
const grantUserIdInput = document.getElementById('grant-user-id')
const paidSongsList = document.getElementById('paid-songs-list')
const statPaidSongsCount = document.getElementById('stat-paid-songs-count')
const recentGrantsTbody = document.getElementById('recent-grants-tbody')
const refreshHistoryBtn = document.getElementById('refresh-history-btn')

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
            <span class="text-xs font-mono font-bold ${u.purchases_count > 0 ? 'text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20' : 'text-text-muted'}" title="Đã mua">
              🛒 ${u.purchases_count || 0} bài
            </span>
            <span class="text-xs font-mono font-bold ${u.favorites_count > 0 ? 'text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20' : 'text-text-muted'}" title="Yêu thích">
              ❤️ ${u.favorites_count || 0}
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

window.selectUserForGrant = function (id) {
  window.switchTab('grant')
  if (grantUserIdInput) {
    grantUserIdInput.value = id
    grantUserIdInput.focus()
  }
  showToast('✓ Đã nạp UUID vào form cấp quyền!', 'info')
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

// Populate Grant Dropdown & Paid Songs Grid
export function renderPaidSongs() {
  const paidSongs = state.songsList.filter((s) => !s.is_free)

  if (statPaidSongsCount) statPaidSongsCount.textContent = `${paidSongs.length} bài`

  // Select dropdown
  if (grantSongSelect) {
    grantSongSelect.innerHTML = '<option value="">-- Chọn bài hát cần cấp quyền --</option>'
    paidSongs.forEach((s) => {
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

    paidSongs.forEach((s) => {
      const div = document.createElement('div')
      div.className =
        'p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-glass-border flex items-center justify-between gap-2 hover:border-accent-primary/40 transition-colors'
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

window.quickSelectSongForGrant = function (songId) {
  if (grantSongSelect) {
    grantSongSelect.value = songId
  }
  if (grantUserIdInput) {
    grantUserIdInput.focus()
  }
  showToast('✓ Đã chọn bài hát vào form!', 'info')
}

// Load Recent Grant History
export async function loadRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-text-muted text-xs">Đang tải lịch sử...</td></tr>`

  try {
    const { data, error } = await supabase.rpc('admin_get_recent_purchases')
    if (error) throw error
    state.recentGrantsList = data || []
    renderRecentGrants()
  } catch (err) {
    console.error('Error loading recent grants:', err)
    recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-rose-500 text-xs">Lỗi khi tải lịch sử.</td></tr>`
  }
}

function renderRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = ''

  if (state.recentGrantsList.length === 0) {
    recentGrantsTbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-text-muted text-xs">Chưa có lượt cấp quyền nào gần đây.</td></tr>`
    return
  }

  state.recentGrantsList.forEach((r) => {
    const tr = document.createElement('tr')
    tr.className =
      'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/40 last:border-0'
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
      const { error } = await supabase.rpc('admin_grant_access', {
        p_user_id: userId,
        p_song_id: songId,
      })
      if (error) throw error

      showToast('✓ Đã cấp quyền xem Tab thành công!', 'success')
      grantUserIdInput.value = ''

      // Reload both lists
      await Promise.all([loadUsers(), loadRecentGrants()])
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

  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', () => loadRecentGrants())
  }
}
