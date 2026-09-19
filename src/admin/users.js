/**
 * ==============================================================================
 * ADMIN DASHBOARD — DANH SÁCH THÀNH VIÊN
 * ==============================================================================
 * Bảng thành viên: tìm kiếm, sắp xếp, mở hồ sơ chi tiết, cấp quyền, xoá.
 * (Chi tiết một thành viên nằm ở user-detail.js; cấp quyền ở grant.js.)
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { confirmDialog } from './confirm.js'
import { escapeHtml, avatarUrlFor, copyText } from './format.js'

const statTotalUsers = document.getElementById('stat-total-users')
const adminUsersTbody = document.getElementById('users-tbody')
const adminSearchUsers = document.getElementById('admin-search-users')
const adminSortUsers = document.getElementById('admin-sort-users')

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

function sortedFilteredUsers() {
  let filtered = [...state.usersList]

  const q = state.userSearchQuery.toLowerCase().trim()
  if (q) {
    filtered = filtered.filter(
      (u) =>
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q))
    )
  }

  const byDate = (key, dir) => (a, b) => (new Date(a[key] || 0) - new Date(b[key] || 0)) * dir
  if (state.userSortBy === 'newest') filtered.sort(byDate('created_at', -1))
  else if (state.userSortBy === 'oldest') filtered.sort(byDate('created_at', 1))
  else if (state.userSortBy === 'purchases_desc')
    filtered.sort((a, b) => (b.purchases_count || 0) - (a.purchases_count || 0))
  else if (state.userSortBy === 'name_asc')
    filtered.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))

  return filtered
}

function roleBadge(u) {
  if (u.role === 'admin') {
    return `<span class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider border border-rose-500/30">ADMIN</span>`
  }
  if (u.purchases_count > 0) {
    return `<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30 shadow-glow">VIP Member</span>`
  }
  return `<span class="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-glass-border text-text-muted text-[10px] font-medium">Free</span>`
}

const ICON_COPY =
  '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>'
const ICON_TRASH =
  '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>'

function renderUsersTable() {
  if (!adminUsersTbody) return
  adminUsersTbody.innerHTML = ''

  const filtered = sortedFilteredUsers()
  if (filtered.length === 0) {
    adminUsersTbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-xs text-text-muted">Không tìm thấy người dùng nào phù hợp.</td></tr>`
    return
  }

  filtered.forEach((u) => {
    const isSelf = state.currentAdminId && u.id === state.currentAdminId
    const uuidStr = String(u.id || '')
    const shortUuid = uuidStr.length > 12 ? `${uuidStr.slice(0, 8)}...${uuidStr.slice(-4)}` : uuidStr

    const tr = document.createElement('tr')
    tr.className =
      'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/50 last:border-0 admin-user-card-row cursor-pointer'
    tr.dataset.userRow = uuidStr
    tr.title = 'Bấm để xem chi tiết thành viên'
    tr.innerHTML = `
      <td data-label="Thành viên" class="p-3 user-col-profile">
        <div class="flex items-center gap-3 w-full">
          <img src="${escapeHtml(avatarUrlFor(u))}" alt="Avatar" class="w-10 h-10 rounded-xl border border-glass-border object-cover bg-glass-bg flex-shrink-0">
          <div class="flex-1 min-w-0 text-left">
            <div class="text-xs sm:text-sm font-bold text-text-primary flex items-center gap-1.5 flex-wrap">
              <span class="truncate max-w-[140px] sm:max-w-none">${escapeHtml(u.full_name || 'Khách Vãng Lai')}</span>
              ${isSelf ? '<span class="text-[10px] text-accent-primary font-bold">(Bạn)</span>' : ''}
              <div class="sm:hidden ml-auto">${roleBadge(u)}</div>
            </div>
            <div class="text-[11px] sm:text-xs text-text-muted font-medium truncate">${escapeHtml(u.email || 'Chưa cập nhật email')}</div>
          </div>
        </div>
      </td>
      <td data-label="Mã User" class="p-3 user-col-uuid">
        <div class="flex items-center justify-between sm:justify-start gap-1.5 w-full">
          <span class="text-[11px] font-bold text-text-muted sm:hidden">Mã UUID:</span>
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-[11px] sm:text-xs text-accent-primary bg-black/5 dark:bg-white/5 px-2 py-0.5 sm:py-1 rounded-lg border border-glass-border cursor-help" title="${escapeHtml(uuidStr)}">${escapeHtml(shortUuid)}</span>
            <button type="button" data-copy-uuid="${escapeHtml(uuidStr)}" class="p-1 sm:p-1.5 rounded-lg bg-glass-bg border border-glass-border hover:bg-glass-bg-hover hover:border-accent-primary text-text-muted hover:text-accent-primary transition-all cursor-pointer" title="Copy UUID">${ICON_COPY}</button>
          </div>
        </div>
      </td>
      <td data-label="Vai trò" class="p-3 text-center user-col-role">${roleBadge(u)}</td>
      <td data-label="Hoạt động" class="p-3 text-center user-col-stats">
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
      <td data-label="Ngày đăng ký" class="p-3 text-[11px] text-text-muted font-medium user-col-date">
        <div class="flex items-center justify-between sm:justify-start w-full">
          <span class="text-[11px] font-bold text-text-muted sm:hidden">Đăng ký:</span>
          <span>${u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}</span>
        </div>
      </td>
      <td data-label="Thao tác" class="p-3 text-right user-col-actions">
        <div class="flex items-center justify-end gap-1.5 w-full">
          <button type="button" data-view-user="${escapeHtml(uuidStr)}" class="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg sm:rounded-xl bg-glass-bg border border-glass-border hover:border-accent-primary hover:text-accent-primary text-text-primary text-xs font-bold transition-all text-center cursor-pointer active:scale-95" title="Xem hồ sơ chi tiết">Chi tiết</button>
          <button type="button" data-grant-user="${escapeHtml(uuidStr)}" class="flex-1 sm:flex-initial py-1.5 px-3 rounded-lg sm:rounded-xl bg-warm-gradient hover:brightness-105 text-white text-xs font-bold transition-all shadow-xs text-center cursor-pointer active:scale-95" title="Cấp quyền tab cho user này">Cấp quyền</button>
          ${
            isSelf
              ? `<button type="button" disabled class="p-2 rounded-lg sm:rounded-xl bg-black/5 dark:bg-white/5 text-text-muted opacity-30 cursor-not-allowed" title="Không thể xoá tài khoản của chính mình">${ICON_TRASH}</button>`
              : `<button type="button" data-delete-user="${escapeHtml(uuidStr)}" class="p-2 rounded-lg sm:rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 transition-all cursor-pointer active:scale-95" title="Xoá vĩnh viễn tài khoản">${ICON_TRASH}</button>`
          }
        </div>
      </td>`
    adminUsersTbody.appendChild(tr)
  })

  bindUsersTableEvents()
}

/**
 * Gắn sự kiện sau mỗi lần render. Dùng listener + `data-*` thay cho
 * `onclick="ten(...)"` trong chuỗi HTML: tên khách nhúng thẳng vào code JS
 * chạy được nên chỉ cần một dấu nháy lọt qua là vỡ cú pháp.
 */
function bindUsersTableEvents() {
  if (!adminUsersTbody) return

  adminUsersTbody.querySelectorAll('[data-copy-uuid]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const ok = await copyText(btn.dataset.copyUuid)
      showToast(ok ? '✓ Đã copy toàn bộ UUID: ' + btn.dataset.copyUuid : '❌ Không copy được', ok ? 'success' : 'error')
    })
  })

  adminUsersTbody.querySelectorAll('[data-view-user]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      navigate('thanh-vien-chi-tiet', btn.dataset.viewUser)
    })
  })

  adminUsersTbody.querySelectorAll('[data-grant-user]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      prefillGrantForUser(btn.dataset.grantUser)
    })
  })

  adminUsersTbody.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      confirmDeleteUser(btn.dataset.deleteUser)
    })
  })

  // Bấm bất kỳ đâu trên dòng (ngoài các nút) là mở hồ sơ chi tiết.
  adminUsersTbody.querySelectorAll('[data-user-row]').forEach((row) => {
    row.addEventListener('click', () => navigate('thanh-vien-chi-tiet', row.dataset.userRow))
  })
}

/** Nhảy sang trang Cấp quyền với khách này đã được chọn sẵn ở bước 1. */
export function prefillGrantForUser(userId) {
  state.grantPrefill = { userId }
  navigate('cap-quyen')
}

async function confirmDeleteUser(id) {
  const user = state.usersList.find((u) => u.id === id)
  const name = user?.full_name || 'Khách vãng lai'

  const answer = await confirmDialog({
    tone: 'danger',
    title: 'Xoá vĩnh viễn tài khoản',
    message:
      'Xoá tài khoản khỏi hệ thống và xoá sạch lịch sử tab đã mua, yêu thích của người này. ' +
      '<strong>Không thể hoàn tác.</strong>',
    detail: [
      ['Tên', name],
      ['Email', user?.email || 'Chưa có'],
      ['Đang sở hữu', `${user?.purchases_count || 0} tab`],
    ],
    confirmText: 'Xoá tài khoản',
  })
  if (!answer) return

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

export function initUsersSection() {
  adminSearchUsers?.addEventListener('input', (e) => {
    state.userSearchQuery = e.target.value
    renderUsersTable()
  })

  adminSortUsers?.addEventListener('change', (e) => {
    state.userSortBy = e.target.value
    renderUsersTable()
  })
}
