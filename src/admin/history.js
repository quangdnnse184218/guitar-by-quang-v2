/**
 * ==============================================================================
 * ADMIN DASHBOARD — LỊCH SỬ MỞ KHOÁ & THU HỒI
 * ==============================================================================
 * Hai bảng của cùng một trang: mọi lượt mở khoá tab (tự động qua SePay hoặc
 * admin cấp tay) và mọi lượt thu hồi (kèm kết quả gỡ quyền Google Drive).
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { revokeAccess } from './access.js'
import { loadUsers } from './users.js'
import { escapeHtml } from './format.js'

const recentGrantsTbody = document.getElementById('recent-grants-tbody')
const refreshHistoryBtn = document.getElementById('refresh-history-btn')
const grantsFilter = document.getElementById('grants-filter')
const revocationsList = document.getElementById('revocations-list')
const revocationsCountBadge = document.getElementById('revocations-count-badge')

const REASON_LABELS = {
  bank_wrong_note: 'Chuyển khoản sai nội dung',
  offline_payment: 'Thanh toán ngoài SePay',
  gift: 'Tặng / khuyến mãi',
  compensation: 'Đền bù lỗi',
  other: 'Lý do khác',
}

const SHORT_DATE = { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }

// ----------------------------------------------------------------------------
// Lượt mở khoá
// ----------------------------------------------------------------------------
export async function loadRecentGrants() {
  if (!recentGrantsTbody) return
  recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-text-muted text-xs">Đang tải lịch sử…</td></tr>`

  try {
    const { data, error } = await supabase.rpc('admin_get_recent_purchases')
    if (error) throw error
    state.recentGrantsList = data || []
    renderRecentGrants()
  } catch (err) {
    console.error('Error loading recent grants:', err)
    recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-rose-500 text-xs">Lỗi khi tải lịch sử.</td></tr>`
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
    recentGrantsTbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-text-muted text-xs">Chưa có lượt mở khoá nào phù hợp.</td></tr>`
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
    tr.className = 'hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-glass-border/40 last:border-0'
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
        ${r.purchased_at ? new Date(r.purchased_at).toLocaleString('vi-VN', SHORT_DATE) : '—'}
      </td>
      <td data-label="Thao tác" class="p-3 text-right">
        <button type="button" data-revoke-user="${escapeHtml(r.user_id)}" data-revoke-song="${escapeHtml(r.song_id)}"
          data-revoke-name="${escapeHtml(r.user_name || '')}" data-revoke-email="${escapeHtml(r.user_email || '')}"
          data-revoke-title="${escapeHtml(r.song_title || r.song_id)}"
          class="revoke-btn px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 text-[10px] font-bold cursor-pointer transition-colors">
          Thu hồi
        </button>
      </td>`
    recentGrantsTbody.appendChild(tr)
  })

  recentGrantsTbody.querySelectorAll('.revoke-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleRevoke(btn.dataset))
  })
}

/** Thu hồi quyền + gỡ quyền Drive (logic dùng chung ở access.js). */
async function handleRevoke(data) {
  const done = await revokeAccess({
    userId: data.revokeUser,
    songId: data.revokeSong,
    userName: data.revokeName,
    userEmail: data.revokeEmail,
    songTitle: data.revokeTitle,
  })
  if (done) {
    await Promise.all([loadRecentGrants(), loadRecentRevocations(), loadUsers()])
  }
}

// ----------------------------------------------------------------------------
// Lượt thu hồi — để thu hồi không còn là hành động vô dấu vết
// ----------------------------------------------------------------------------
export async function loadRecentRevocations() {
  if (!revocationsList) return
  revocationsList.innerHTML = `<div class="p-6 text-center text-xs text-text-muted">Đang tải…</div>`

  try {
    const { data, error } = await supabase.rpc('admin_get_recent_revocations')
    if (error) throw error
    const list = data || []

    if (revocationsCountBadge) revocationsCountBadge.textContent = String(list.length)

    if (list.length === 0) {
      revocationsList.innerHTML = `<div class="p-6 text-center text-xs text-text-muted">Chưa thu hồi tab của ai.</div>`
      return
    }

    revocationsList.innerHTML = list
      .map(
        (r) => `
        <div class="p-3.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-text-primary">${escapeHtml(r.user_name)}</span>
            <span class="text-[11px] text-text-muted">${escapeHtml(r.user_email || '')}</span>
            ${
              r.drive_removed === true
                ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold whitespace-nowrap">Đã gỡ Drive</span>'
                : r.drive_removed === false
                  ? '<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold whitespace-nowrap">Chưa gỡ Drive</span>'
                  : ''
            }
          </div>
          <div class="text-[11px] text-text-muted mt-0.5">
            <span class="font-bold text-accent-primary">${escapeHtml(r.song_title)}</span>
            · ${escapeHtml(new Date(r.revoked_at).toLocaleString('vi-VN', SHORT_DATE))}
            ${r.revoked_by_name ? ` · bởi ${escapeHtml(r.revoked_by_name)}` : ''}
          </div>
          ${r.reason ? `<div class="text-[11px] text-text-primary mt-1 italic">“${escapeHtml(r.reason)}”</div>` : ''}
        </div>`
      )
      .join('')
  } catch (err) {
    console.error('Error loading revocations:', err)
    revocationsList.innerHTML = `<div class="p-6 text-center text-xs text-rose-500">Lỗi khi tải lịch sử thu hồi: ${escapeHtml(err.message)}</div>`
  }
}

export function initHistorySection() {
  refreshHistoryBtn?.addEventListener('click', () => {
    loadRecentGrants()
    loadRecentRevocations()
  })
  grantsFilter?.addEventListener('change', () => renderRecentGrants())
}
