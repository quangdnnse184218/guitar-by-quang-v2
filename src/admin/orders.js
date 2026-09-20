/**
 * ==============================================================================
 * ADMIN DASHBOARD — ĐƠN CHỜ THANH TOÁN
 * ==============================================================================
 * "Đơn chờ" = khách đã bấm mua và có mã đơn (DHxxxxxx) nhưng CHƯA CÓ TIỀN NÀO VỀ.
 * Gần như toàn là khách mở form thanh toán rồi bỏ giữa chừng nên đây chỉ là trang
 * TRA CỨU đơn của một khách, không phải danh sách việc cần làm. Việc cần làm thật
 * (tiền đã về mà khách chưa nhận tab) nằm ở trang Tiền về (payments.js), xuất
 * phát từ giao dịch ngân hàng thật.
 *
 * Đơn của khách ĐÃ SỞ HỮU đúng tab đó bị ẩn hẳn: họ đã nhận được thứ họ cần
 * (qua một đơn khác hoặc admin cấp tay). Việc lọc làm ở đây thay vì ở SQL để chạy
 * đúng ngay cả khi chưa cập nhật database. Đơn quá 3 ngày do database tự hết hạn.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { escapeHtml, formatVnd, formatAge, copyText } from './format.js'

const listEl = document.getElementById('pending-orders-list')
const summaryEl = document.getElementById('orders-summary')
const filtersEl = document.getElementById('orders-filters')
const searchEl = document.getElementById('pending-search')
const hiddenNoteEl = document.getElementById('orders-hidden-note')
const refreshBtn = document.getElementById('refresh-pending-btn')

/** Dưới ngưỡng này khách có thể vẫn đang ở màn hình quét mã thanh toán. */
const FRESH_MINUTES = 30
/** Trên ngưỡng này gần như chắc chắn khách đã bỏ — cũng là mốc database tự hết hạn đơn. */
const STALE_MINUTES = 3 * 24 * 60

/**
 * Phân nhóm theo khả năng cần admin ra tay:
 *  - waiting: 30 phút → 3 ngày — đủ lâu để khách đã chuyển khoản và đang chờ tab
 *  - fresh:   dưới 30 phút — nhiều khả năng khách đang thanh toán, đừng vội
 *  - stale:   trên 3 ngày — gần như chắc chắn đã bỏ
 */
function classify(order) {
  const m = Number(order.age_minutes) || 0
  if (m < FRESH_MINUTES) return 'fresh'
  if (m >= STALE_MINUTES) return 'stale'
  return 'waiting'
}

export { classify as classifyOrder }

const GROUPS = {
  waiting: {
    label: 'Cần kiểm tra',
    hint: 'Chờ 30 phút đến 3 ngày',
    pill: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    priority: 0,
  },
  fresh: {
    label: 'Vừa tạo',
    hint: 'Dưới 30 phút',
    pill: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
    priority: 1,
  },
  stale: {
    label: 'Có thể bỏ',
    hint: 'Treo quá 3 ngày',
    pill: 'bg-black/10 dark:bg-white/10 text-text-muted',
    priority: 2,
  },
}

let actionable = []
let hiddenOwned = 0
let activeFilter = 'all'

/**
 * Lấy đơn chờ đã lọc bỏ đơn của khách đã sở hữu tab. Dùng chung với trang Tổng
 * quan để hai nơi luôn hiện cùng một con số.
 */
export async function fetchActionableOrders() {
  const { data, error } = await supabase.rpc('admin_get_pending_orders')
  if (error) throw error
  const all = data || []
  const list = all.filter((o) => !o.already_owns)
  return { list, hiddenOwned: all.length - list.length }
}

export async function loadPendingOrders() {
  if (!listEl) return
  listEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Đang tải đơn hàng…</div>`

  try {
    const result = await fetchActionableOrders()
    actionable = result.list
    hiddenOwned = result.hiddenOwned
    render()
  } catch (err) {
    console.error('Error loading pending orders:', err)
    listEl.innerHTML = `<div class="p-8 text-center text-xs text-rose-500">Lỗi khi tải đơn: ${escapeHtml(err.message)}</div>`
  }
}

function countBy(predicate) {
  return actionable.filter(predicate).length
}

function renderSummary() {
  if (!summaryEl) return

  const waiting = countBy((o) => classify(o) === 'waiting')
  const fresh = countBy((o) => classify(o) === 'fresh')
  const stale = countBy((o) => classify(o) === 'stale')

  const tile = (value, label, hint, tone) => `
    <div class="glass-card border border-glass-border rounded-2xl p-3.5 sm:p-4">
      <div class="text-[10px] font-bold text-text-muted uppercase tracking-wider">${label}</div>
      <div class="text-xl sm:text-2xl font-black mt-0.5 font-mono tabular-nums ${tone}">${value}</div>
      <div class="text-[10px] text-text-muted font-medium mt-0.5">${hint}</div>
    </div>`

  summaryEl.innerHTML =
    tile(waiting, GROUPS.waiting.label, GROUPS.waiting.hint, waiting > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-text-primary') +
    tile(fresh, GROUPS.fresh.label, GROUPS.fresh.hint, 'text-text-primary') +
    tile(stale, GROUPS.stale.label, GROUPS.stale.hint, 'text-text-muted')
}

function renderFilters() {
  if (!filtersEl) return

  const options = [
    ['all', 'Tất cả', actionable.length],
    ['waiting', GROUPS.waiting.label, countBy((o) => classify(o) === 'waiting')],
    ['fresh', GROUPS.fresh.label, countBy((o) => classify(o) === 'fresh')],
    ['stale', GROUPS.stale.label, countBy((o) => classify(o) === 'stale')],
    ['hssv', 'HSSV', countBy((o) => o.is_hssv)],
  ]

  filtersEl.innerHTML = options
    .map(([key, label, count]) => {
      const on = activeFilter === key
      return `<button type="button" data-filter="${key}"
        class="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
          on
            ? 'bg-accent-primary text-white border-accent-primary'
            : 'bg-glass-bg text-text-muted border-glass-border hover:text-text-primary'
        }">${label} <span class="font-mono ${on ? 'text-white/80' : ''}">${count}</span></button>`
    })
    .join('')

  filtersEl.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter
      render()
    })
  })
}

function matchesFilter(order) {
  if (activeFilter === 'all') return true
  if (activeFilter === 'hssv') return !!order.is_hssv
  return classify(order) === activeFilter
}

function matchesSearch(order, q) {
  if (!q) return true
  return (
    (order.order_code || '').toLowerCase().includes(q) ||
    (order.user_name || '').toLowerCase().includes(q) ||
    (order.user_email || '').toLowerCase().includes(q) ||
    (order.song_title || '').toLowerCase().includes(q)
  )
}

function orderRow(o) {
  const group = GROUPS[classify(o)]
  return `
    <div class="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-black/[0.03] dark:hover:bg-white/[0.03] transition-colors">
      <div class="flex-1 min-w-0 space-y-1">
        <div class="flex items-center gap-2 flex-wrap">
          <button type="button" data-copy-code="${escapeHtml(o.order_code)}" title="Bấm để copy mã đơn"
            class="font-mono font-black text-xs text-text-primary hover:text-accent-primary transition-colors cursor-pointer inline-flex items-center gap-1">
            ${escapeHtml(o.order_code)}
            <svg class="w-3 h-3 opacity-50" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          </button>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${group.pill}">${group.label}</span>
          <span class="text-[10px] text-text-muted">${formatAge(o.age_minutes)}</span>
          ${o.is_hssv ? '<span class="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-bold">HSSV</span>' : ''}
        </div>
        <div class="text-sm font-bold text-text-primary truncate">
          ${escapeHtml(o.user_name)}
          <span class="text-text-muted font-normal text-xs">· ${escapeHtml(o.user_email || 'chưa có email')}</span>
        </div>
        <div class="text-xs text-text-muted truncate">
          ${escapeHtml(o.song_title)} ·
          <span class="font-mono font-bold text-accent-primary">${formatVnd(o.amount)}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button type="button" data-view-user="${escapeHtml(o.user_id)}"
          class="px-3 py-2 rounded-xl bg-glass-bg border border-glass-border hover:border-accent-primary hover:text-accent-primary text-text-primary text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap">
          Xem khách
        </button>
        <button type="button" data-grant-user="${escapeHtml(o.user_id)}" data-grant-song="${escapeHtml(o.song_id)}" data-grant-code="${escapeHtml(o.order_code)}"
          class="px-4 py-2 rounded-xl bg-warm-gradient hover:brightness-105 text-white text-[11px] font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap">
          Cấp quyền →
        </button>
      </div>
    </div>`
}

function render() {
  if (!listEl) return

  renderSummary()
  renderFilters()

  if (hiddenNoteEl) {
    if (hiddenOwned > 0) {
      hiddenNoteEl.textContent = `Đã ẩn ${hiddenOwned} đơn của khách đã sở hữu tab đó — không cần xử lý.`
      hiddenNoteEl.classList.remove('hidden')
    } else {
      hiddenNoteEl.classList.add('hidden')
    }
  }

  const q = (searchEl?.value || '').toLowerCase().trim()
  const shown = actionable
    .filter((o) => matchesFilter(o) && matchesSearch(o, q))
    // Nhóm cần kiểm tra lên đầu; trong cùng nhóm, đơn mới nhất trước.
    .sort(
      (a, b) =>
        GROUPS[classify(a)].priority - GROUPS[classify(b)].priority ||
        (Number(a.age_minutes) || 0) - (Number(b.age_minutes) || 0)
    )

  if (shown.length === 0) {
    listEl.innerHTML = `<div class="p-10 text-center space-y-1">
      <div class="text-sm font-bold text-text-primary">${
        actionable.length === 0 ? 'Không có đơn nào cần xử lý' : 'Không có đơn nào khớp'
      }</div>
      <div class="text-xs text-text-muted">${
        actionable.length === 0
          ? 'Mọi đơn đều đã hoàn tất hoặc đã được cấp quyền.'
          : 'Thử bỏ bộ lọc hoặc đổi từ khoá tìm kiếm.'
      }</div>
    </div>`
    return
  }

  listEl.innerHTML = shown.map(orderRow).join('')

  listEl.querySelectorAll('[data-copy-code]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await copyText(btn.dataset.copyCode)
      showToast(ok ? `✓ Đã copy mã đơn ${btn.dataset.copyCode}` : '❌ Không copy được', ok ? 'success' : 'error')
    })
  })

  listEl.querySelectorAll('[data-view-user]').forEach((btn) => {
    btn.addEventListener('click', () => navigate('thanh-vien-chi-tiet', btn.dataset.viewUser))
  })

  listEl.querySelectorAll('[data-grant-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Đơn chờ nghĩa là khách nói "đã chuyển khoản", nên gợi ý sẵn lý do phổ
      // biến nhất và ghi mã đơn vào ghi chú để sau này đối chiếu được.
      state.grantPrefill = {
        userId: btn.dataset.grantUser,
        songId: btn.dataset.grantSong,
        reason: 'bank_wrong_note',
        note: `Theo đơn ${btn.dataset.grantCode}`,
      }
      navigate('cap-quyen')
    })
  })
}

export function initOrdersSection() {
  refreshBtn?.addEventListener('click', () => loadPendingOrders())
  searchEl?.addEventListener('input', () => render())
}
