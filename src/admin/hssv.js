/**
 * ==============================================================================
 * ADMIN DASHBOARD — DUYỆT HSSV
 * ==============================================================================
 * Khách giảm giá HSSV nộp ảnh thẻ; AI đọc thẻ và tự duyệt khi mọi thứ rõ ràng
 * (hạ giá ngay), còn nghi ngờ thì chuyển vào đây. Trang này để admin:
 *   • xem lại ảnh thẻ + thông tin AI đọc được + các cờ cảnh báo,
 *   • "Đã xem" → ảnh tự xoá sau 3 ngày (tối đa 30 ngày dù không xem),
 *   • "Duyệt giảm giá" cho lượt AI chưa chắc, hoặc "Thu hồi giảm giá" khi ảnh không ổn.
 *
 * Ảnh nằm trong bucket riêng tư `hssv-cards`; admin xem qua link ký có hạn 5 phút
 * (policy `hssv_cards_select_admin`). Các RPC chỉ có sau khi chạy file SQL
 * 20260921_hssv_verifications.sql — trước đó trang hiện hướng dẫn.
 */
import { supabase } from '../lib/supabase.js'
import { showToast } from './toast.js'
import { confirmDialog } from './confirm.js'
import { escapeHtml, formatVnd, formatDateTime, copyText } from './format.js'

const listEl = document.getElementById('hssv-list')
const setupNoticeEl = document.getElementById('hssv-setup-notice')
const refreshBtn = document.getElementById('hssv-refresh')
const countEl = document.getElementById('hssv-count')
const filterEl = document.getElementById('hssv-filter')

const SIGNED_URL_SECONDS = 300

const STATUS_PILL = {
  approved: {
    label: 'AI đã duyệt',
    cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  pending: { label: 'Chờ admin duyệt', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  rejected: { label: 'AI từ chối', cls: 'bg-black/10 dark:bg-white/10 text-text-muted' },
  revoked: { label: 'Đã thu hồi', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
}

// warn = đáng để ý nhất; info = ít nghiêm trọng hơn.
const FLAGS = {
  duplicate_id: { label: 'Mã HS/SV đã dùng ở tài khoản khác', level: 'warn' },
  name_mismatch: { label: 'Tên trên thẻ khác tên tài khoản', level: 'warn' },
  expired: { label: 'Thẻ hết hạn', level: 'warn' },
  unreadable: { label: 'Ảnh mờ / khó đọc', level: 'info' },
  no_student_id: { label: 'Không đọc được mã HS/SV', level: 'info' },
  no_expiry: { label: 'Không đọc được hạn thẻ', level: 'info' },
  card_uncertain: { label: 'AI không chắc đây là thẻ', level: 'info' },
  ai_unavailable: { label: 'AI không đọc được', level: 'info' },
  legacy: { label: 'Xác minh kiểu cũ (chưa đọc tên/mã)', level: 'info' },
}

const FILTERS = {
  todo: (r) => r.status === 'pending' && !r.reviewed_at,
  unseen: (r) => !r.reviewed_at && r.status !== 'rejected',
  all: () => true,
}

let rows = []

function isMissingFunction(err) {
  const msg = String(err?.message || '')
  return err?.code === 'PGRST202' || /could not find the function|does not exist/i.test(msg)
}

/** Chỉ tạo liên kết Zalo khi giá trị là số điện thoại hoặc link zalo.me thật. */
export function zaloHref(value) {
  const v = String(value || '').trim()
  if (/^https:\/\/(zalo\.me|chat\.zalo\.me)\/[\w./?=&%-]*$/i.test(v)) return v
  const digits = v.replace(/[\s.-]/g, '')
  if (/^\+?\d{9,12}$/.test(digits)) return `https://zalo.me/${digits.replace(/^\+/, '')}`
  return null
}

/** Cập nhật badge số lượt đang chờ admin duyệt (sidebar + thanh dưới mobile). */
export async function loadHssvBadge() {
  const { data, error } = await supabase.rpc('admin_count_hssv_pending')
  const count = error ? 0 : Number(data) || 0
  document.querySelectorAll('[data-hssv-badge]').forEach((badge) => {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count)
      badge.classList.remove('hidden')
    } else {
      badge.classList.add('hidden')
    }
  })
}

function flagPills(flags) {
  return (flags || [])
    .filter((f) => FLAGS[f])
    .map((f) => {
      const cls =
        FLAGS[f].level === 'warn'
          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}">${escapeHtml(FLAGS[f].label)}</span>`
    })
    .join('')
}

function infoLine(label, value) {
  return `
    <div class="flex gap-2 text-[11px] min-w-0">
      <span class="text-text-muted flex-shrink-0 w-20">${escapeHtml(label)}</span>
      <span class="font-semibold text-text-primary break-words min-w-0">${value}</span>
    </div>`
}

function imageBlock(r) {
  if (r.image_path) {
    return `
      <div class="space-y-1.5" data-image-wrap="${escapeHtml(r.id)}">
        <button type="button" data-show-image="${escapeHtml(r.id)}"
          class="w-full sm:w-44 h-28 rounded-xl border border-dashed border-glass-border bg-black/[0.03] dark:bg-white/[0.04] hover:border-accent-primary text-[11px] font-bold text-text-muted hover:text-accent-primary transition-colors cursor-pointer">
          Xem ảnh thẻ
        </button>
        <div class="text-[10px] text-text-muted">Ảnh tự xoá: ${escapeHtml(formatDateTime(r.purge_at))}</div>
      </div>`
  }
  return `
    <div class="w-full sm:w-44 h-28 rounded-xl border border-glass-border bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-center text-center px-3 text-[10px] text-text-muted leading-snug">
      Ảnh đã được xoá${r.image_purged_at ? ' ' + escapeHtml(formatDateTime(r.image_purged_at)) : ''}.<br>Kết quả đọc thẻ vẫn được giữ.
    </div>`
}

function actionButtons(r) {
  const btn = (attr, text, cls) =>
    `<button type="button" ${attr}="${escapeHtml(r.id)}" class="px-3.5 py-2 rounded-xl text-[11px] font-bold transition-colors cursor-pointer active:scale-95 ${cls}">${text}</button>`

  const out = []
  if (r.status === 'pending') {
    out.push(
      btn('data-hssv-approve', 'Duyệt giảm giá', 'bg-warm-gradient hover:brightness-105 text-white')
    )
  }
  if (!r.reviewed_at && r.status !== 'revoked') {
    out.push(
      btn(
        'data-hssv-seen',
        r.status === 'pending' ? 'Đã xem, giữ nguyên' : 'Đã xem, hợp lệ',
        'bg-glass-bg border border-glass-border hover:border-accent-primary hover:text-accent-primary text-text-primary'
      )
    )
  }
  if (r.status !== 'revoked' && r.status !== 'rejected') {
    out.push(
      btn(
        'data-hssv-revoke',
        'Thu hồi giảm giá',
        'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
      )
    )
  }
  return out.join('')
}

function reviewCard(r) {
  const pill = STATUS_PILL[r.status] || STATUS_PILL.pending
  const zalo = r.user_zalo
    ? escapeHtml(r.user_zalo)
    : '<span class="text-text-muted font-normal">chưa cung cấp</span>'
  const zaloUrl = zaloHref(r.user_zalo)
  const orderText = r.order_code
    ? `<span class="font-mono">${escapeHtml(r.order_code)}</span> · ${escapeHtml(r.song_title || '')} · <span class="font-mono">${formatVnd(r.order_amount)}</span> · ${r.order_status === 'paid' ? '<span class="text-emerald-600 dark:text-emerald-400">đã thanh toán</span>' : r.order_status === 'pending' ? 'chờ thanh toán' : 'hết hạn'}`
    : '<span class="text-text-muted font-normal">đơn đã bị xoá</span>'
  const others = Number(r.other_accounts_same_card) || 0

  return `
    <div class="p-4 sm:p-5 space-y-3.5" data-hssv-card="${escapeHtml(r.id)}">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold ${pill.cls}">${pill.label}</span>
        ${r.reviewed_at ? `<span class="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 text-[10px] font-bold">Đã xem ${escapeHtml(formatDateTime(r.reviewed_at))}</span>` : ''}
        <span class="text-[10px] text-text-muted font-mono ml-auto">${escapeHtml(formatDateTime(r.created_at))}</span>
      </div>

      ${(r.flags || []).some((f) => FLAGS[f]) || others > 0 ? `<div class="flex flex-wrap gap-1.5">${flagPills(r.flags)}${others > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400">${others} tài khoản khác cùng mã</span>` : ''}</div>` : ''}

      <div class="flex flex-col sm:flex-row gap-4">
        ${imageBlock(r)}
        <div class="flex-1 min-w-0 space-y-1.5">
          ${infoLine('Tài khoản', `${escapeHtml(r.user_name)} <span class="text-text-muted font-normal">· ${escapeHtml(r.user_email || 'chưa có email')}</span> <a href="#/thanh-vien/${encodeURIComponent(r.user_id)}" class="text-accent-primary hover:underline font-bold">Hồ sơ →</a>`)}
          ${infoLine('Zalo', `${zalo}${r.user_zalo ? ` <button type="button" data-copy="${escapeHtml(r.user_zalo)}" class="text-accent-primary hover:underline font-bold ml-1 cursor-pointer">Copy</button>` : ''}${zaloUrl ? ` <a href="${escapeHtml(zaloUrl)}" target="_blank" rel="noopener noreferrer" class="text-accent-primary hover:underline font-bold ml-1">Mở Zalo</a>` : ''}`)}
          ${infoLine('Đơn', orderText)}
          <div class="pt-1.5 mt-1.5 border-t border-glass-border space-y-1.5">
            <div class="text-[10px] font-bold uppercase tracking-wider text-text-muted">AI đọc được trên thẻ</div>
            ${infoLine('Họ tên', r.extracted_name ? escapeHtml(r.extracted_name) : '<span class="text-text-muted font-normal">không đọc được</span>')}
            ${infoLine('Trường', r.extracted_school ? escapeHtml(r.extracted_school) : '<span class="text-text-muted font-normal">không đọc được</span>')}
            ${infoLine('Mã HS/SV', r.extracted_id ? `<span class="font-mono">${escapeHtml(r.extracted_id)}</span>` : '<span class="text-text-muted font-normal">không đọc được</span>')}
            ${infoLine('Hạn thẻ', r.extracted_expiry ? escapeHtml(r.extracted_expiry) : '<span class="text-text-muted font-normal">không đọc được</span>')}
            ${r.ai_reason ? `<div class="text-[11px] text-text-muted italic leading-snug">“${escapeHtml(r.ai_reason)}”</div>` : ''}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap pt-1">${actionButtons(r)}</div>
    </div>`
}

function render() {
  if (!listEl) return
  const filter = FILTERS[filterEl?.value] || FILTERS.todo
  const shown = rows.filter(filter)

  if (countEl) countEl.textContent = String(rows.filter(FILTERS.todo).length)

  if (shown.length === 0) {
    const isTodo = (filterEl?.value || 'todo') === 'todo'
    listEl.innerHTML = `
      <div class="p-10 text-center space-y-1">
        <div class="text-sm font-bold ${isTodo ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-primary'}">${isTodo ? 'Không có lượt nào cần bạn duyệt' : 'Chưa có lượt xác minh nào'}</div>
        <div class="text-xs text-text-muted">${isTodo ? 'Khi AI chưa chắc về một thẻ, lượt đó sẽ hiện ở đây.' : 'Các lượt khách nộp thẻ HSSV sẽ hiện ở đây.'}</div>
      </div>`
    return
  }

  listEl.innerHTML = shown.map(reviewCard).join('')
  bindEvents()
}

function findRow(id) {
  return rows.find((r) => r.id === id)
}

async function showImage(id) {
  const r = findRow(id)
  const wrap = listEl.querySelector(`[data-image-wrap="${CSS.escape(id)}"]`)
  if (!r?.image_path || !wrap) return

  const { data, error } = await supabase.storage
    .from('hssv-cards')
    .createSignedUrl(r.image_path, SIGNED_URL_SECONDS)

  if (error || !data?.signedUrl) {
    showToast('❌ Không mở được ảnh (có thể đã bị xoá)', 'error')
    return
  }

  wrap.innerHTML = `
    <a href="${escapeHtml(data.signedUrl)}" target="_blank" rel="noopener noreferrer" title="Mở ảnh lớn ở tab mới">
      <img src="${escapeHtml(data.signedUrl)}" alt="Ảnh thẻ HSSV" class="w-full sm:w-64 max-h-56 object-contain rounded-xl border border-glass-border bg-black/5" />
    </a>
    <div class="text-[10px] text-text-muted">Link ảnh hết hạn sau 5 phút · Ảnh tự xoá: ${escapeHtml(formatDateTime(r.purge_at))}</div>`
}

async function review(id, action) {
  const r = findRow(id)
  if (!r) return

  if (action === 'revoke') {
    const paid = r.order_status === 'paid'
    const answer = await confirmDialog({
      tone: 'danger',
      title: 'Thu hồi giảm giá HSSV',
      message: paid
        ? `Khách <strong>đã thanh toán</strong> đơn này với giá HSSV. Nút này chỉ đánh dấu lượt xác minh là không hợp lệ — nó <strong>không</strong> thu tab và không hoàn tiền. Sau đó hãy nhắn khách (Zalo/email) để họ bù chênh lệch, và dùng “Thu hồi tab” ở hồ sơ khách nếu cần.`
        : 'Đơn chưa thanh toán sẽ được trả về giá gốc.',
      detail: [
        ['Khách', r.user_name],
        ['Đơn', r.order_code || '—'],
      ],
      confirmText: 'Thu hồi giảm giá',
    })
    if (!answer) return
  }

  try {
    const { data, error } = await supabase.rpc('admin_review_hssv', { p_id: id, p_action: action })
    if (error) throw error

    if (action === 'approve') {
      showToast(
        data?.new_amount
          ? `✓ Đã duyệt — đơn ${data.order_code} giờ là ${formatVnd(data.new_amount)}`
          : '✓ Đã duyệt giảm giá',
        'success'
      )
    } else if (action === 'revoke') {
      showToast(
        data?.order_paid
          ? '✓ Đã đánh dấu thu hồi. Khách đã trả rồi — hãy nhắn khách để xử lý phần chênh lệch.'
          : '✓ Đã thu hồi giảm giá, đơn trở về giá gốc',
        'success'
      )
    } else {
      showToast('✓ Đã đánh dấu đã xem — ảnh sẽ tự xoá sau 3 ngày', 'success')
    }
    await loadHssv()
  } catch (err) {
    console.error(err)
    showToast('❌ ' + (err.message || 'Không thực hiện được'), 'error')
  }
}

function bindEvents() {
  const on = (selector, dataKey, fn) =>
    listEl
      .querySelectorAll(selector)
      .forEach((el) => el.addEventListener('click', () => fn(el.dataset[dataKey])))

  on('[data-show-image]', 'showImage', showImage)
  on('[data-hssv-approve]', 'hssvApprove', (id) => review(id, 'approve'))
  on('[data-hssv-seen]', 'hssvSeen', (id) => review(id, 'seen'))
  on('[data-hssv-revoke]', 'hssvRevoke', (id) => review(id, 'revoke'))

  listEl.querySelectorAll('[data-copy]').forEach((el) =>
    el.addEventListener('click', async () => {
      showToast((await copyText(el.dataset.copy)) ? '✓ Đã copy' : '❌ Không copy được', 'success')
    })
  )
}

export async function loadHssv() {
  if (!listEl) return
  listEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Đang tải…</div>`

  const { data, error } = await supabase.rpc('admin_get_hssv_reviews', { p_limit: 200 })

  if (error) {
    if (isMissingFunction(error)) {
      setupNoticeEl?.classList.remove('hidden')
      listEl.innerHTML = `<div class="p-8 text-center text-xs text-text-muted">Chưa bật tính năng duyệt HSSV — xem hướng dẫn ở khung phía trên.</div>`
      return
    }
    console.error('Error loading HSSV reviews:', error)
    listEl.innerHTML = `<div class="p-8 text-center text-xs text-rose-500">Lỗi khi tải: ${escapeHtml(error.message || '')}</div>`
    return
  }

  setupNoticeEl?.classList.add('hidden')
  rows = data || []
  render()
  loadHssvBadge()
}

export function initHssvSection() {
  refreshBtn?.addEventListener('click', loadHssv)
  filterEl?.addEventListener('change', render)
}
