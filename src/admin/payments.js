/**
 * ==============================================================================
 * ADMIN DASHBOARD — TIỀN VỀ (giao dịch ngân hàng)
 * ==============================================================================
 * Đây mới là chỗ trả lời câu hỏi thật của người bán: "có tiền nào đã về mà khách
 * chưa nhận được tab không?". Webhook SePay ghi lại MỌI khoản tiền vào (bảng
 * bank_transactions); khoản nào không tự khớp được đơn (thiếu mã, đơn hết hạn,
 * chuyển thiếu...) hiện ở đây kèm các đơn có thể là của khoản đó.
 *
 * "Đơn chưa hoàn tất" trước đây là đoán mò từ phía đơn hàng — phần lớn là khách
 * bỏ giữa chừng và không có tiền nào đi kèm. Ở đây xuất phát từ tiền THẬT.
 *
 * Các RPC mới chỉ có sau khi chạy file SQL 20260920_bank_transactions.sql; trước
 * đó trang hiện hướng dẫn thay vì báo lỗi khó hiểu.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { confirmDialog } from './confirm.js'
import { updateOrdersBadge } from './badge.js'
import { escapeHtml, formatVnd, formatAge, formatDateTime } from './format.js'

const unmatchedEl = document.getElementById('payments-unmatched')
const recentEl = document.getElementById('payments-recent')
const setupNoticeEl = document.getElementById('payments-setup-notice')
const refreshBtn = document.getElementById('payments-refresh')
const unmatchedCountEl = document.getElementById('payments-unmatched-count')

const REASONS = {
  no_code: { label: 'Không có mã đơn', hint: 'Khách chuyển khoản mà quên ghi mã DH…' },
  order_not_found: { label: 'Mã đơn không tồn tại', hint: 'Nội dung có mã nhưng không có đơn nào khớp' },
  order_already_paid: {
    label: 'Chuyển thừa',
    hint: 'Đơn này đã được thanh toán rồi — khoản này có thể cần hoàn tiền',
  },
  order_expired: { label: 'Đơn đã hết hạn', hint: 'Khách trả muộn sau khi đơn bị đóng' },
  amount_low: { label: 'Thiếu tiền', hint: 'Số tiền thấp hơn giá đơn' },
}

const STATUS_PILL = {
  matched: { label: 'Tự khớp', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  unmatched: { label: 'Chưa khớp', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  assigned: { label: 'Đã gán', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  dismissed: { label: 'Đã bỏ qua', cls: 'bg-black/10 dark:bg-white/10 text-text-muted' },
}

let unmatched = []

/** RPC chưa tồn tại = chưa chạy file SQL. */
function isMissingFunction(err) {
  const msg = String(err?.message || '')
  return err?.code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)
}

/**
 * Lấy danh sách tiền chưa khớp. Dùng chung với Tổng quan.
 * @returns {Promise<{list: object[], setupNeeded: boolean}>}
 */
export async function fetchUnmatchedTransactions() {
  const { data, error } = await supabase.rpc('admin_get_unmatched_transactions')
  if (error) {
    if (isMissingFunction(error)) return { list: [], setupNeeded: true }
    throw error
  }
  return { list: data || [], setupNeeded: false }
}

function candidateRow(tx, c) {
  const statusText = c.status === 'expired' ? 'Đã hết hạn' : 'Đang chờ'
  return `
    <div class="flex flex-col sm:flex-row sm:items-center gap-2.5 p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-glass-border">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="font-mono font-black text-[11px] text-text-primary">${escapeHtml(c.order_code)}</span>
          <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
            c.status === 'expired' ? 'bg-black/10 dark:bg-white/10 text-text-muted' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }">${statusText}</span>
          ${c.code_match ? '<span class="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">Đúng mã đơn</span>' : ''}
          ${c.amount_match ? '<span class="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">Đúng số tiền</span>' : ''}
          ${c.is_hssv ? '<span class="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[9px] font-bold">HSSV</span>' : ''}
        </div>
        <div class="text-xs font-bold text-text-primary truncate mt-0.5">
          ${escapeHtml(c.user_name)}
          <span class="text-text-muted font-normal">· ${escapeHtml(c.user_email || 'chưa có email')}</span>
        </div>
        <div class="text-[11px] text-text-muted truncate">${escapeHtml(c.song_title)} · <span class="font-mono">${formatVnd(c.amount)}</span></div>
      </div>
      <button type="button" data-assign-tx="${escapeHtml(tx.id)}" data-assign-order="${escapeHtml(c.order_id)}"
        class="px-3.5 py-2 rounded-xl bg-warm-gradient hover:brightness-105 text-white text-[11px] font-bold transition-all cursor-pointer active:scale-95 whitespace-nowrap flex-shrink-0">
        Gán cho khách này →
      </button>
    </div>`
}

function unmatchedCard(tx) {
  const reason = REASONS[tx.reason] || { label: tx.reason || 'Chưa khớp', hint: '' }
  const candidates = tx.candidates || []
  const when = tx.occurred_at || tx.received_at
  const minutes = when ? Math.round((Date.now() - new Date(when).getTime()) / 60000) : 0

  return `
    <div class="p-4 sm:p-5 space-y-3.5" data-tx-card="${escapeHtml(tx.id)}">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div class="min-w-0">
          <div class="text-2xl font-black font-mono tabular-nums text-text-primary">${formatVnd(tx.amount)}</div>
          <div class="text-[11px] text-text-muted mt-0.5">${escapeHtml(formatAge(minutes))}${tx.gateway ? ' · ' + escapeHtml(tx.gateway) : ''}</div>
        </div>
        <div class="text-right">
          <span class="inline-block px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-extrabold">${escapeHtml(reason.label)}</span>
          ${reason.hint ? `<div class="text-[10px] text-text-muted mt-1 max-w-[220px] ml-auto leading-snug">${escapeHtml(reason.hint)}</div>` : ''}
        </div>
      </div>

      <div class="text-xs text-text-primary px-3 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border break-words">
        <span class="text-[10px] font-bold uppercase tracking-wider text-text-muted block mb-0.5">Nội dung chuyển khoản</span>
        ${tx.content ? escapeHtml(tx.content) : '<span class="text-text-muted italic">(trống)</span>'}
      </div>

      ${
        candidates.length > 0
          ? `<div class="space-y-2">
               <div class="text-[10px] font-bold uppercase tracking-wider text-text-muted">Có thể là đơn của</div>
               ${candidates.map((c) => candidateRow(tx, c)).join('')}
             </div>`
          : `<div class="text-[11px] text-text-muted leading-relaxed">
               Không có đơn nào trùng số tiền và mã đơn. Nếu biết khách nào đã chuyển, bạn vẫn có thể gán thủ công.
             </div>`
      }

      <div class="flex items-center gap-2 flex-wrap pt-1">
        <button type="button" data-manual-tx="${escapeHtml(tx.id)}"
          class="px-3.5 py-2 rounded-xl bg-glass-bg border border-glass-border hover:border-accent-primary hover:text-accent-primary text-text-primary text-[11px] font-bold transition-colors cursor-pointer">
          ${candidates.length > 0 ? 'Cấp cho khách khác…' : 'Chọn khách để cấp tab…'}
        </button>
        <button type="button" data-dismiss-tx="${escapeHtml(tx.id)}"
          class="px-3.5 py-2 rounded-xl text-text-muted hover:text-text-primary text-[11px] font-bold transition-colors cursor-pointer">
          Không cần cấp tab
        </button>
      </div>
    </div>`
}

function renderUnmatched() {
  if (!unmatchedEl) return

  if (unmatchedCountEl) unmatchedCountEl.textContent = String(unmatched.length)

  if (unmatched.length === 0) {
    unmatchedEl.innerHTML = `
      <div class="p-10 text-center space-y-1">
        <div class="text-sm font-bold text-emerald-600 dark:text-emerald-400">Mọi khoản tiền về đều đã khớp đơn</div>
        <div class="text-xs text-text-muted">Khi có tiền về mà không khớp được đơn nào, nó sẽ hiện ở đây và bạn nhận được email báo.</div>
      </div>`
    return
  }

  unmatchedEl.innerHTML = unmatched.map(unmatchedCard).join('')
  bindUnmatchedEvents()
}

function findTx(id) {
  return unmatched.find((t) => t.id === id)
}

function bindUnmatchedEvents() {
  unmatchedEl.querySelectorAll('[data-assign-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = findTx(btn.dataset.assignTx)
      const cand = tx?.candidates?.find((c) => c.order_id === btn.dataset.assignOrder)
      if (!tx || !cand) return
      state.grantPrefill = {
        userId: cand.user_id,
        songId: cand.song_id,
        orderId: cand.order_id,
        reason: 'bank_wrong_note',
        note: `Tiền về ${formatVnd(tx.amount)} — ${cand.order_code}`,
        transactionId: tx.id,
        amount: tx.amount,
        txContent: tx.content,
      }
      navigate('cap-quyen')
    })
  })

  unmatchedEl.querySelectorAll('[data-manual-tx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tx = findTx(btn.dataset.manualTx)
      if (!tx) return
      state.grantPrefill = {
        reason: 'bank_wrong_note',
        note: `Tiền về ${formatVnd(tx.amount)}`,
        transactionId: tx.id,
        amount: tx.amount,
        txContent: tx.content,
      }
      navigate('cap-quyen')
    })
  })

  unmatchedEl.querySelectorAll('[data-dismiss-tx]').forEach((btn) => {
    btn.addEventListener('click', () => dismissTransaction(btn.dataset.dismissTx))
  })
}

async function dismissTransaction(id) {
  const tx = findTx(id)
  if (!tx) return

  const answer = await confirmDialog({
    tone: 'warn',
    title: 'Không cần cấp tab cho khoản này',
    message:
      'Khoản tiền sẽ được đánh dấu là đã xử lý và biến khỏi danh sách cần làm. ' +
      'Dùng khi bạn đã hoàn tiền, khách chuyển nhầm, hoặc khoản này không liên quan đến bán tab.',
    detail: [
      ['Số tiền', formatVnd(tx.amount)],
      ['Nội dung', tx.content || '(trống)'],
    ],
    input: { label: 'Ghi chú (nên ghi để sau này tra lại)', placeholder: 'VD: đã hoàn tiền cho khách qua Momo' },
    confirmText: 'Đánh dấu đã xử lý',
  })
  if (!answer) return

  try {
    const { error } = await supabase.rpc('admin_resolve_transaction', {
      p_transaction_id: id,
      p_action: 'dismiss',
      p_note: answer.input || null,
    })
    if (error) throw error
    showToast('✓ Đã đánh dấu khoản tiền này là đã xử lý', 'success')
    await loadPayments()
  } catch (err) {
    console.error(err)
    showToast('❌ ' + (err.message || 'Không xử lý được khoản tiền'), 'error')
  }
}

function renderRecent(list) {
  if (!recentEl) return

  if (list.length === 0) {
    recentEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Chưa ghi nhận giao dịch nào. Các khoản tiền về từ giờ sẽ hiện ở đây.</div>`
    return
  }

  recentEl.innerHTML = list
    .map((t) => {
      const pill = STATUS_PILL[t.status] || STATUS_PILL.dismissed
      const who = [t.user_name, t.song_title].filter(Boolean).join(' · ')
      const note = t.resolved_note ? `“${t.resolved_note}”` : ''
      return `
      <div class="p-3.5 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-mono font-bold text-xs text-text-primary">${formatVnd(t.amount)}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${pill.cls}">${pill.label}</span>
            ${t.order_code ? `<span class="font-mono text-[10px] text-text-muted">${escapeHtml(t.order_code)}</span>` : ''}
          </div>
          <div class="text-[11px] text-text-muted truncate mt-0.5">${escapeHtml(who || t.content || '—')}</div>
          ${note ? `<div class="text-[10px] text-text-muted italic truncate">${escapeHtml(note)}${t.resolved_by_name ? ' — ' + escapeHtml(t.resolved_by_name) : ''}</div>` : ''}
        </div>
        <span class="text-[10px] text-text-muted font-mono flex-shrink-0 text-right">${escapeHtml(formatDateTime(t.occurred_at || t.received_at))}</span>
      </div>`
    })
    .join('')
}

function showSetupNotice(show) {
  setupNoticeEl?.classList.toggle('hidden', !show)
  if (show) {
    if (unmatchedEl) {
      unmatchedEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Chưa bật theo dõi tiền về — xem hướng dẫn ở khung phía trên.</div>`
    }
    if (recentEl) recentEl.innerHTML = ''
  }
}

export async function loadPayments() {
  if (unmatchedEl) {
    unmatchedEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Đang tải…</div>`
  }

  const [unmatchedRes, recentRes] = await Promise.allSettled([
    fetchUnmatchedTransactions(),
    supabase.rpc('admin_get_recent_transactions'),
  ])

  if (unmatchedRes.status === 'rejected') {
    console.error('Error loading unmatched transactions:', unmatchedRes.reason)
    if (unmatchedEl) {
      unmatchedEl.innerHTML = `<div class="p-8 text-center text-xs text-rose-500">Lỗi khi tải: ${escapeHtml(unmatchedRes.reason?.message || '')}</div>`
    }
    return
  }

  if (unmatchedRes.value.setupNeeded) {
    updateOrdersBadge(0)
    showSetupNotice(true)
    return
  }

  showSetupNotice(false)
  unmatched = unmatchedRes.value.list
  // Badge trên sidebar = số khoản tiền đang cần admin xử lý.
  updateOrdersBadge(unmatched.length)
  renderUnmatched()

  if (recentRes.status === 'fulfilled' && !recentRes.value.error) {
    renderRecent(recentRes.value.data || [])
  } else if (recentEl) {
    recentEl.innerHTML = ''
  }
}

export function initPaymentsSection() {
  refreshBtn?.addEventListener('click', loadPayments)
}
