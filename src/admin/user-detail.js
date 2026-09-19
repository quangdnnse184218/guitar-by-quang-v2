/**
 * ==============================================================================
 * ADMIN DASHBOARD — CHI TIẾT MỘT THÀNH VIÊN
 * ==============================================================================
 * Trang riêng ở route `#/thanh-vien/<uuid>`: bấm vào một dòng trong bảng thành
 * viên là mở được toàn bộ hồ sơ người đó thay vì chỉ thấy vài con số tổng.
 *
 * Toàn bộ dữ liệu lấy trong đúng 1 lần gọi `admin_get_user_detail` (hồ sơ + số
 * liệu + tab đang sở hữu + đơn hàng + yêu thích + lịch sử thu hồi) — thay vì 5
 * truy vấn rời từ trình duyệt rồi tự ghép, vừa chậm vừa phải mở quyền đọc
 * nhiều bảng cho client.
 *
 * Danh sách bên trong dùng thẻ (card) chứ không dùng `<table>`: bảng 6 cột phải
 * cuộn ngang trên điện thoại, còn thẻ thì xuống dòng tự nhiên.
 */
import { supabase } from '../lib/supabase.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { revokeAccess } from './access.js'
import { confirmDialog } from './confirm.js'
import { loadUsers, prefillGrantForUser } from './users.js'
import { escapeHtml, formatVnd, formatDateTime, formatDate, avatarUrlFor } from './format.js'

const root = document.getElementById('user-detail-root')

let currentUserId = null
let currentDetail = null
let activePanel = 'purchases'

const REASON_LABELS = {
  bank_wrong_note: 'Chuyển khoản sai nội dung',
  offline_payment: 'Thanh toán ngoài SePay',
  gift: 'Tặng / khuyến mãi',
  compensation: 'Đền bù lỗi',
  other: 'Lý do khác',
}

const ORDER_STATUS = {
  paid: { label: 'Đã thanh toán', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  pending: { label: 'Đang chờ', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  expired: { label: 'Hết hạn', cls: 'bg-black/10 dark:bg-white/10 text-text-muted' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
}

function statTile(label, value, extra = '', accent = 'text-text-primary') {
  return `
    <div class="glass-card border border-glass-border rounded-2xl p-3.5">
      <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider">${escapeHtml(label)}</div>
      <div class="text-lg sm:text-xl font-black ${accent} mt-0.5 font-mono tabular-nums">${escapeHtml(value)}</div>
      ${extra ? `<div class="text-[10px] text-text-muted mt-0.5 font-medium">${escapeHtml(extra)}</div>` : ''}
    </div>`
}

function emptyPanel(text) {
  return `<div class="p-8 text-center text-xs text-text-muted">${escapeHtml(text)}</div>`
}

function renderPurchasesPanel(purchases) {
  if (!purchases.length) return emptyPanel('Thành viên này chưa sở hữu tab nào.')

  return `<div class="divide-y divide-glass-border">${purchases
    .map((p) => {
      const sourceBadge = p.is_manual
        ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold whitespace-nowrap">Admin cấp tay</span>`
        : `<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold whitespace-nowrap">Tự động</span>`

      const grantNote = p.is_manual
        ? `<div class="text-[10px] text-text-muted mt-1 leading-relaxed">
             ${escapeHtml(REASON_LABELS[p.grant_reason] || p.grant_reason || 'Không rõ lý do')}
             ${p.granted_by_name ? ` · bởi ${escapeHtml(p.granted_by_name)}` : ''}
             ${p.grant_note ? `<br><span class="italic">“${escapeHtml(p.grant_note)}”</span>` : ''}
           </div>`
        : ''

      return `
      <div class="p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-text-primary">${escapeHtml(p.song_title)}</span>
            ${sourceBadge}
            ${p.has_drive_link ? '<span class="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-bold whitespace-nowrap">Có Drive</span>' : ''}
          </div>
          <div class="text-[11px] text-text-muted mt-0.5">
            ${p.singer ? escapeHtml(p.singer) + ' · ' : ''}${p.price ? formatVnd(p.price) : 'Miễn phí'} · mở khoá ${escapeHtml(formatDateTime(p.purchased_at))}
          </div>
          ${grantNote}
        </div>
        <button type="button" data-revoke-song="${escapeHtml(p.song_id)}" data-revoke-title="${escapeHtml(p.song_title)}"
          class="detail-revoke-btn px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-600 text-[11px] font-bold cursor-pointer transition-colors flex-shrink-0 whitespace-nowrap active:scale-95">
          Thu hồi
        </button>
      </div>`
    })
    .join('')}</div>`
}

function renderOrdersPanel(orders) {
  if (!orders.length) return emptyPanel('Chưa có đơn hàng nào.')

  return `<div class="divide-y divide-glass-border">${orders
    .map((o) => {
      const st = ORDER_STATUS[o.status] || {
        label: o.status || 'Không rõ',
        cls: 'bg-black/10 dark:bg-white/10 text-text-muted',
      }
      return `
      <div class="p-3.5 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono font-black text-xs text-text-primary">${escapeHtml(o.order_code)}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${st.cls}">${escapeHtml(st.label)}</span>
            ${o.is_hssv ? '<span class="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-bold whitespace-nowrap">HSSV</span>' : ''}
          </div>
          <div class="text-[11px] text-text-muted truncate mt-0.5">${escapeHtml(o.song_title)}</div>
          <div class="text-[10px] text-text-muted mt-0.5">
            Tạo ${escapeHtml(formatDateTime(o.created_at))}${o.paid_at ? ` · trả ${escapeHtml(formatDateTime(o.paid_at))}` : ''}
          </div>
        </div>
        <span class="font-mono font-bold text-xs text-accent-primary flex-shrink-0">${escapeHtml(formatVnd(o.amount))}</span>
      </div>`
    })
    .join('')}</div>`
}

function renderFavoritesPanel(favorites) {
  if (!favorites.length) return emptyPanel('Thành viên này chưa thích bài nào.')

  return `<div class="p-3.5 flex flex-wrap gap-2">${favorites
    .map(
      (f) => `
      <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border text-[11px] font-semibold text-text-primary">
        <svg class="w-3 h-3 text-rose-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.25c-4.5-2.7-9-6.44-9-10.5C3 6.5 5.5 4 8.25 4c1.6 0 3 .8 3.75 2.1C12.75 4.8 14.15 4 15.75 4 18.5 4 21 6.5 21 9.75c0 4.06-4.5 7.8-9 10.5z"/></svg>
        ${escapeHtml(f.song_title)}
        <span class="text-text-muted font-mono text-[10px]">${escapeHtml(formatDate(f.created_at))}</span>
      </span>`
    )
    .join('')}</div>`
}

function renderRevocationsPanel(revocations) {
  if (!revocations.length) return emptyPanel('Chưa từng bị thu hồi tab nào.')

  return `<div class="divide-y divide-glass-border">${revocations
    .map(
      (r) => `
      <div class="p-3.5">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs font-bold text-text-primary">${escapeHtml(r.song_title)}</span>
          ${
            r.drive_removed === true
              ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold whitespace-nowrap">Đã gỡ Drive</span>'
              : r.drive_removed === false
                ? '<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-bold whitespace-nowrap">Chưa gỡ Drive</span>'
                : ''
          }
        </div>
        <div class="text-[11px] text-text-muted mt-0.5">
          ${escapeHtml(formatDateTime(r.revoked_at))}${r.revoked_by_name ? ` · bởi ${escapeHtml(r.revoked_by_name)}` : ''}
        </div>
        ${r.reason ? `<div class="text-[11px] text-text-primary mt-1 italic">“${escapeHtml(r.reason)}”</div>` : ''}
      </div>`
    )
    .join('')}</div>`
}

function panelButton(key, label, count) {
  const isActive = activePanel === key
  return `
    <button type="button" data-detail-panel="${key}"
      class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
        isActive ? 'bg-warm-gradient text-white shadow-xs' : 'text-text-muted hover:text-text-primary'
      }">
      <span>${escapeHtml(label)}</span>
      <span class="font-mono ${isActive ? 'text-white/80' : 'text-text-muted'}">${count}</span>
    </button>`
}

function render() {
  if (!root || !currentDetail) return

  const { profile, stats, purchases, orders, favorites, revocations } = currentDetail
  const isAdminAccount = profile.role === 'admin'

  const panels = {
    purchases: () => renderPurchasesPanel(purchases),
    orders: () => renderOrdersPanel(orders),
    favorites: () => renderFavoritesPanel(favorites),
    revocations: () => renderRevocationsPanel(revocations),
  }

  root.innerHTML = `
    <button type="button" id="detail-back-btn"
      class="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
      Danh sách thành viên
    </button>

    <!-- Hồ sơ -->
    <div class="glass-card border border-glass-border rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4">
      <img src="${escapeHtml(avatarUrlFor(profile))}" alt=""
        class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-glass-border bg-glass-bg flex-shrink-0" />
      <div class="flex-1 min-w-0 space-y-2">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-base sm:text-lg font-black text-text-primary">${escapeHtml(profile.full_name)}</h2>
          ${
            isAdminAccount
              ? '<span class="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider border border-rose-500/30">ADMIN</span>'
              : stats.purchases_count > 0
                ? '<span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30">VIP Member</span>'
                : '<span class="px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-glass-border text-text-muted text-[10px] font-medium">Free</span>'
          }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 text-[11px]">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-text-muted flex-shrink-0">Email</span>
            <span class="font-semibold text-text-primary truncate">${escapeHtml(profile.email || 'chưa có')}</span>
            ${
              profile.email
                ? `<button type="button" data-copy="${escapeHtml(profile.email)}" class="detail-copy-btn p-1 rounded-md text-text-muted hover:text-accent-primary transition-colors cursor-pointer flex-shrink-0" title="Copy email">
                     <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                   </button>`
                : ''
            }
          </div>
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-text-muted flex-shrink-0">Mã UUID</span>
            <span class="font-mono text-accent-primary truncate">${escapeHtml(profile.id)}</span>
            <button type="button" data-copy="${escapeHtml(profile.id)}" class="detail-copy-btn p-1 rounded-md text-text-muted hover:text-accent-primary transition-colors cursor-pointer flex-shrink-0" title="Copy UUID">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Ngày đăng ký</span>
            <span class="font-semibold text-text-primary">${escapeHtml(formatDate(profile.created_at))}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Đăng nhập gần nhất</span>
            <span class="font-semibold text-text-primary">${escapeHtml(formatDateTime(profile.last_sign_in_at))}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-text-muted">Xác thực email</span>
            ${
              profile.email_confirmed_at
                ? `<span class="font-semibold text-emerald-600 dark:text-emerald-400">Đã xác thực</span>`
                : `<span class="font-semibold text-amber-600 dark:text-amber-400">Chưa xác thực</span>`
            }
          </div>
        </div>
      </div>

      <div class="flex sm:flex-col gap-2 flex-shrink-0">
        <button type="button" id="detail-grant-btn"
          class="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-warm-gradient hover:brightness-105 text-white text-xs font-bold shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap">
          Cấp quyền tab
        </button>
        <button type="button" id="detail-delete-btn" ${isAdminAccount ? 'disabled' : ''}
          class="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          title="${isAdminAccount ? 'Không xoá tài khoản quản trị từ đây' : 'Xoá vĩnh viễn tài khoản'}">
          Xoá tài khoản
        </button>
      </div>
    </div>

    <!-- Số liệu -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
      ${statTile('Tab đang sở hữu', stats.purchases_count, '', 'text-accent-primary')}
      ${statTile('Tổng đã chi', formatVnd(stats.total_spent), '', 'text-emerald-600 dark:text-emerald-400')}
      ${statTile('Đơn đã trả', stats.orders_paid, `Tổng ${stats.orders_total} đơn`)}
      ${statTile('Đơn đang chờ', stats.orders_pending, '', stats.orders_pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-text-primary')}
      ${statTile('Admin cấp tay', stats.manual_grants, '', stats.manual_grants > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-text-primary')}
      ${statTile('Đã thu hồi', stats.revocations_count, '', stats.revocations_count > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-text-primary')}
    </div>

    <!-- Danh sách chi tiết -->
    <div class="glass-card border border-glass-border rounded-2xl overflow-hidden">
      <div class="p-2 border-b border-glass-border flex items-center gap-1.5 overflow-x-auto admin-detail-tabs">
        ${panelButton('purchases', 'Tab đang sở hữu', purchases.length)}
        ${panelButton('orders', 'Đơn hàng', orders.length)}
        ${panelButton('favorites', 'Yêu thích', favorites.length)}
        ${panelButton('revocations', 'Đã thu hồi', revocations.length)}
      </div>
      <div id="detail-panel-body">${panels[activePanel]()}</div>
    </div>
  `

  bindEvents()
}

function bindEvents() {
  if (!root) return

  root.querySelector('#detail-back-btn')?.addEventListener('click', () => navigate('thanh-vien'))

  root.querySelectorAll('[data-detail-panel]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activePanel = btn.dataset.detailPanel
      render()
    })
  })

  root.querySelectorAll('.detail-copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy)
      showToast('✓ Đã copy: ' + btn.dataset.copy, 'success')
    })
  })

  root.querySelectorAll('.detail-revoke-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const done = await revokeAccess({
        userId: currentUserId,
        songId: btn.dataset.revokeSong,
        songTitle: btn.dataset.revokeTitle,
        userName: currentDetail?.profile?.full_name,
        userEmail: currentDetail?.profile?.email,
      })
      if (done) {
        await Promise.all([loadUserDetail(currentUserId), loadUsers()])
      }
    })
  })

  root.querySelector('#detail-grant-btn')?.addEventListener('click', () => {
    prefillGrantForUser(currentUserId)
  })

  root.querySelector('#detail-delete-btn')?.addEventListener('click', async () => {
    const profile = currentDetail?.profile
    if (!profile) return

    const answer = await confirmDialog({
      tone: 'danger',
      title: 'Xoá vĩnh viễn tài khoản',
      message:
        'Xoá tài khoản khỏi hệ thống và xoá sạch lịch sử tab đã mua, yêu thích của người này. ' +
        '<strong>Không thể hoàn tác.</strong>',
      detail: [
        ['Tên', profile.full_name],
        ['Email', profile.email || 'chưa có'],
        ['Đang sở hữu', `${currentDetail.stats.purchases_count} tab`],
      ],
      confirmText: 'Xoá tài khoản',
    })
    if (!answer) return

    try {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: currentUserId })
      if (error) throw error
      showToast(`✓ Đã xoá tài khoản "${profile.full_name}"`, 'success')
      await loadUsers()
      navigate('thanh-vien')
    } catch (err) {
      console.error(err)
      showToast('❌ Lỗi khi xoá user: ' + err.message, 'error')
    }
  })
}

/** Nạp và hiển thị chi tiết một thành viên. Router gọi hàm này khi vào route. */
export async function loadUserDetail(userId) {
  if (!root || !userId) return

  const isSameUser = userId === currentUserId
  currentUserId = userId
  if (!isSameUser) activePanel = 'purchases'

  if (!isSameUser || !currentDetail) {
    root.innerHTML = `<div class="glass-card border border-glass-border rounded-2xl p-10 text-center text-xs text-text-muted">Đang tải hồ sơ thành viên…</div>`
  }

  try {
    const { data, error } = await supabase.rpc('admin_get_user_detail', { p_user_id: userId })
    if (error) throw error
    currentDetail = data
    render()
  } catch (err) {
    console.error('Error loading user detail:', err)
    root.innerHTML = `
      <div class="glass-card border border-rose-500/30 rounded-2xl p-6 space-y-3 text-center">
        <p class="text-xs text-rose-500 font-semibold">Không tải được hồ sơ: ${escapeHtml(err.message)}</p>
        <button type="button" id="detail-back-btn" class="px-4 py-2 rounded-xl bg-glass-bg border border-glass-border text-xs font-bold text-text-primary cursor-pointer">← Về danh sách thành viên</button>
      </div>`
    root.querySelector('#detail-back-btn')?.addEventListener('click', () => navigate('thanh-vien'))
  }
}
