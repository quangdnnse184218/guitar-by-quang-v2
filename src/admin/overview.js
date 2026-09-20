/**
 * ==============================================================================
 * ADMIN DASHBOARD — TỔNG QUAN
 * ==============================================================================
 * Trang đầu tiên admin nhìn thấy mỗi ngày nên được sắp theo thứ tự ưu tiên của
 * người quản lý một cửa hàng nhỏ:
 *   1. Có việc gì cần xử lý ngay không?  (tiền về chưa khớp, Drive lỗi, bài thiếu link)
 *   2. Hôm nay / tháng này bán được bao nhiêu, so với kỳ trước ra sao?
 *   3. Xu hướng doanh thu, bài nào bán chạy.
 *   4. Vừa có ai mở khoá tab gì.
 *
 * Số liệu tổng hợp lấy trong 1 lần gọi RPC `admin_get_overview_stats` (tính sẵn
 * ở database). Các khoá mới của bản v2 có thể chưa có nếu chưa chạy file SQL
 * migration — mọi phần dùng chúng đều tự ẩn thay vì hiện "NaN"/"undefined".
 */
import { supabase } from '../lib/supabase.js'
import { showToast } from './toast.js'
import { navigate } from './router.js'
import { updateOrdersBadge } from './badge.js'
import { fetchUnmatchedTransactions } from './payments.js'
import { escapeHtml, formatVnd, formatVndShort, formatAge, percentChange } from './format.js'

const CHART_RANGE_KEY = 'gbq_admin_chart_range'

let lastStats = null
let lastPayments = null
let lastActivity = []
let chartRange = readChartRange()

function readChartRange() {
  try {
    return localStorage.getItem(CHART_RANGE_KEY) === '30' ? 30 : 7
  } catch {
    return 7
  }
}

function has(value) {
  return value !== undefined && value !== null
}

function setHtml(id, html) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = html
}

// ----------------------------------------------------------------------------
// 1. Việc cần xử lý
// ----------------------------------------------------------------------------
const TONE = {
  danger: { dot: 'bg-rose-500', box: 'border-rose-500/25 bg-rose-500/[0.06]' },
  warn: { dot: 'bg-amber-500', box: 'border-amber-500/25 bg-amber-500/[0.06]' },
  info: { dot: 'bg-sky-500', box: 'border-sky-500/25 bg-sky-500/[0.06]' },
}

// Tailwind chỉ sinh class xuất hiện nguyên văn trong mã nguồn — không ghép động.
const ATTENTION_COLS = { 1: '', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' }

function buildAttentionItems() {
  const items = []

  // Tiền đã về mà chưa khớp đơn nào: việc quan trọng nhất — có thể có khách đã
  // trả tiền mà chưa nhận được tab.
  if (lastPayments?.setupNeeded) {
    items.push({
      tone: 'info',
      title: 'Chưa bật theo dõi tiền về',
      detail:
        'Chạy file SQL 20260920_bank_transactions.sql để mọi khoản tiền về được ghi lại và báo cho bạn khi không khớp đơn nào.',
      action: 'Xem hướng dẫn',
      route: 'tien-ve',
    })
  } else if (lastPayments && lastPayments.list.length > 0) {
    const total = lastPayments.list.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)
    items.push({
      tone: 'danger',
      title: `${lastPayments.list.length} khoản tiền về chưa khớp đơn (${formatVnd(total)})`,
      detail: 'Khách có thể đã chuyển khoản mà chưa nhận được tab — gán khoản tiền cho đúng khách.',
      action: 'Xử lý ngay',
      route: 'tien-ve',
    })
  }

  const driveFailed = Number(lastStats?.revocations_drive_failed_30d) || 0
  if (driveFailed > 0) {
    items.push({
      tone: 'danger',
      title: `${driveFailed} lượt thu hồi chưa gỡ được quyền Drive`,
      detail: 'Khách đó vẫn mở được file trên Drive — cần vào Drive bỏ chia sẻ tay.',
      action: 'Xem lịch sử',
      route: 'lich-su',
    })
  }

  const missingDrive = Number(lastStats?.paid_songs_missing_drive) || 0
  if (missingDrive > 0) {
    items.push({
      tone: 'danger',
      title: `${missingDrive} bài có phí chưa có link Drive`,
      detail: 'Khách mua xong sẽ không nhận được file. Thêm link ở mục Video Tab Có Phí.',
      action: 'Mở kho tab',
      route: 'kho-tab',
    })
  }

  return items
}

function renderAttention() {
  // Chưa có dữ liệu nào về thì đừng vội tuyên bố "không có gì cần làm".
  if (!lastStats && !lastPayments) {
    setHtml('ov-attention', `<div class="glass-card border border-glass-border rounded-2xl p-3.5 text-xs text-text-muted">Đang kiểm tra…</div>`)
    return
  }

  const items = buildAttentionItems()

  if (items.length === 0) {
    setHtml(
      'ov-attention',
      `<div class="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
        Không có việc nào cần xử lý lúc này.
      </div>`
    )
    return
  }

  setHtml(
    'ov-attention',
    `<div class="grid grid-cols-1 ${ATTENTION_COLS[Math.min(items.length, 3)]} gap-2.5">${items
      .map(
        (it, i) => `
        <div class="flex items-start gap-3 p-3.5 rounded-xl border ${TONE[it.tone].box}">
          <span class="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${TONE[it.tone].dot}"></span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-extrabold text-text-primary">${escapeHtml(it.title)}</div>
            <div class="text-[11px] text-text-muted leading-relaxed mt-0.5">${escapeHtml(it.detail)}</div>
            <button type="button" data-attention="${i}" class="mt-1.5 text-[11px] font-bold text-accent-primary hover:underline cursor-pointer">${escapeHtml(it.action)} →</button>
          </div>
        </div>`
      )
      .join('')}</div>`
  )

  document.querySelectorAll('[data-attention]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(items[Number(btn.dataset.attention)].route))
  })
}

// ----------------------------------------------------------------------------
// 2. Chỉ số chính
// ----------------------------------------------------------------------------
/** Chip "▲ 12%" / "▼ 8%"; null khi kỳ trước không có dữ liệu để so sánh. */
function deltaChip(current, previous) {
  const pct = percentChange(current, previous)
  if (pct === null) return ''
  const up = pct >= 0
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
    up ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
  }">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>`
}

function renderKpis(s) {
  const month = Number(s.revenue_month) || 0
  const monthOrders = Number(s.orders_paid_month) || 0
  const aov = monthOrders > 0 ? Math.round(month / monthOrders) : 0

  let compare = ''
  if (has(s.revenue_prev_month_to_date)) {
    const prev = Number(s.revenue_prev_month_to_date) || 0
    compare =
      prev > 0
        ? `${deltaChip(month, prev)} <span class="text-[11px] text-text-muted">so với cùng kỳ tháng trước (${formatVnd(prev)})</span>`
        : `<span class="text-[11px] text-text-muted">Tháng trước chưa có doanh thu để so sánh</span>`
  }

  setHtml(
    'ov-kpi-month',
    `<div class="text-[11px] font-bold text-text-muted uppercase tracking-wider">Doanh thu tháng này</div>
     <div class="text-3xl sm:text-4xl font-black text-text-primary mt-1 font-mono tabular-nums tracking-tight">${formatVnd(month)}</div>
     ${compare ? `<div class="flex items-center gap-2 flex-wrap mt-2">${compare}</div>` : ''}
     <div class="mt-3 pt-3 border-t border-glass-border grid grid-cols-3 gap-3 text-[11px]">
       <div><div class="text-text-muted">Đơn đã trả</div><div class="font-mono font-bold text-text-primary text-sm">${monthOrders}</div></div>
       <div><div class="text-text-muted">TB mỗi đơn</div><div class="font-mono font-bold text-text-primary text-sm">${aov > 0 ? formatVnd(aov) : '—'}</div></div>
       <div><div class="text-text-muted">Từ trước tới nay</div><div class="font-mono font-bold text-text-primary text-sm">${formatVndShort(s.revenue_total)}</div></div>
     </div>`
  )

  const today = Number(s.revenue_today) || 0
  const yesterdayLine = has(s.revenue_yesterday) ? `Hôm qua ${formatVnd(s.revenue_yesterday)}` : ''
  setHtml(
    'ov-kpi-today',
    `<div class="text-[11px] font-bold text-text-muted uppercase tracking-wider">Doanh thu hôm nay</div>
     <div class="text-2xl font-black mt-1 font-mono tabular-nums ${today > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-primary'}">${formatVnd(today)}</div>
     ${yesterdayLine ? `<div class="text-[11px] text-text-muted mt-1.5">${yesterdayLine}</div>` : ''}`
  )

  const newWeek = Number(s.users_new_week) || 0
  setHtml(
    'ov-kpi-users',
    `<div class="text-[11px] font-bold text-text-muted uppercase tracking-wider">Thành viên</div>
     <div class="text-2xl font-black text-text-primary mt-1 font-mono tabular-nums">${Number(s.users_total) || 0}</div>
     <div class="text-[11px] text-text-muted mt-1.5">+${newWeek} tuần này${has(s.users_new_month) ? ` · +${Number(s.users_new_month) || 0} trong 30 ngày` : ''}</div>`
  )
}

// ----------------------------------------------------------------------------
// 3. Biểu đồ doanh thu (đúng tỷ lệ: nhãn trục Y là giá trị thật của biểu đồ)
// ----------------------------------------------------------------------------
function chartSeries(s) {
  const thirty = s.revenue_last_30_days
  if (Array.isArray(thirty) && thirty.length > 0) return thirty.slice(-chartRange)
  // Chưa chạy SQL v2: chỉ có 7 ngày.
  return Array.isArray(s.revenue_last_7_days) ? s.revenue_last_7_days : []
}

function renderChart(s) {
  const series = chartSeries(s)
  const hasLongRange = Array.isArray(s.revenue_last_30_days) && s.revenue_last_30_days.length > 0

  // Nút chuyển 7/30 ngày chỉ hiện khi có dữ liệu 30 ngày.
  const toggle = document.getElementById('ov-chart-range')
  if (toggle) {
    toggle.classList.toggle('hidden', !hasLongRange)
    toggle.querySelectorAll('[data-range]').forEach((btn) => {
      const on = Number(btn.dataset.range) === chartRange
      btn.className = `px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
        on ? 'bg-accent-primary text-white' : 'text-text-muted hover:text-text-primary'
      }`
    })
  }

  const chart = document.getElementById('ov-chart')
  const summary = document.getElementById('ov-chart-summary')
  if (!chart) return

  if (series.length === 0) {
    chart.innerHTML = `<div class="h-full flex items-center justify-center text-xs text-text-muted">Chưa có dữ liệu.</div>`
    if (summary) summary.textContent = ''
    return
  }

  const values = series.map((d) => Number(d.revenue) || 0)
  const total = values.reduce((a, b) => a + b, 0)
  const max = Math.max(...values, 0)
  const peakIndex = max > 0 ? values.indexOf(max) : -1
  const avg = Math.round(total / series.length)

  if (summary) {
    summary.innerHTML =
      total > 0
        ? `Tổng <strong class="text-text-primary">${formatVnd(total)}</strong> · TB <strong class="text-text-primary">${formatVnd(avg)}</strong>/ngày · cao nhất <strong class="text-text-primary">${escapeHtml(series[peakIndex].label)}</strong>`
        : `Chưa có doanh thu trong ${series.length} ngày qua.`
  }

  // Không có doanh thu thì trục Y vẫn phải có thang — dùng 1 để tránh chia 0.
  const scaleMax = max > 0 ? max : 1
  const labelEvery = series.length > 10 ? 5 : 1
  const lastIndex = series.length - 1

  const bars = series
    .map((d, i) => {
      const v = values[i]
      const pct = v > 0 ? Math.max((v / scaleMax) * 100, 3) : 0
      const isToday = i === lastIndex
      const orders = has(d.orders) ? ` · ${d.orders} đơn` : ''
      return `
        <div class="flex-1 min-w-0 h-full flex items-end group relative" title="${escapeHtml(d.label)}: ${formatVnd(v)}${orders}">
          ${isToday && v > 0 ? `<span class="absolute left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-text-primary whitespace-nowrap" style="bottom: calc(${pct}% + 4px)">${formatVndShort(v)}</span>` : ''}
          <div class="w-full rounded-t-md transition-opacity ${
            v > 0 ? (isToday ? 'bg-warm-gradient' : 'bg-accent-primary/55 group-hover:bg-accent-primary') : 'bg-black/10 dark:bg-white/10'
          }" style="height: ${v > 0 ? pct : 1.5}%"></div>
        </div>`
    })
    .join('')

  const labels = series
    .map((d, i) => {
      // Đếm lùi từ hôm nay: nhãn cuối luôn có mặt và không bao giờ chồng nhãn
      // kề nó (đếm xuôi thì ngày cuối có thể rơi sát một nhãn cách 5 ngày).
      const show = (lastIndex - i) % labelEvery === 0
      return `<span class="flex-1 min-w-0 text-center text-[9px] text-text-muted font-medium whitespace-nowrap overflow-visible">${show ? escapeHtml(d.label) : ''}</span>`
    })
    .join('')

  chart.innerHTML = `
    <div class="flex gap-2">
      <div class="h-40 w-9 flex flex-col justify-between text-right text-[9px] font-mono text-text-muted flex-shrink-0 -my-1.5">
        <span>${max > 0 ? formatVndShort(scaleMax) : ''}</span>
        <span>${max > 0 ? formatVndShort(scaleMax / 2) : ''}</span>
        <span>0</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="relative h-40">
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none" aria-hidden="true">
            <div class="border-t border-dashed border-glass-border"></div>
            <div class="border-t border-dashed border-glass-border"></div>
            <div class="border-t border-glass-border"></div>
          </div>
          <div class="relative h-full flex items-end ${series.length > 10 ? 'gap-[3px]' : 'gap-2'}">${bars}</div>
        </div>
        <div class="flex ${series.length > 10 ? 'gap-[3px]' : 'gap-2'} mt-1.5">${labels}</div>
      </div>
    </div>`
}

// ----------------------------------------------------------------------------
// 4. Bài bán chạy + hoạt động gần đây
// ----------------------------------------------------------------------------
function renderTopSongs(songs) {
  if (!songs || songs.length === 0) {
    setHtml('ov-top-songs', `<li class="text-text-muted text-xs py-2">Chưa có lượt mở khoá nào.</li>`)
    return
  }

  const max = Math.max(...songs.map((s) => Number(s.sold_count) || 0), 1)

  setHtml(
    'ov-top-songs',
    songs
      .map((s, i) => {
        const count = Number(s.sold_count) || 0
        return `
        <li class="space-y-1.5">
          <div class="flex items-baseline justify-between gap-3">
            <span class="text-xs font-bold text-text-primary truncate min-w-0">
              <span class="text-text-muted font-mono mr-1">${i + 1}</span>${escapeHtml(s.song_title)}
            </span>
            <span class="flex-shrink-0 text-[11px] font-mono text-text-muted">
              <strong class="text-accent-primary">${count}</strong> lượt${has(s.revenue) && Number(s.revenue) > 0 ? ` · ${formatVndShort(s.revenue)}` : ''}
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div class="h-full rounded-full bg-warm-gradient" style="width: ${(count / max) * 100}%"></div>
          </div>
        </li>`
      })
      .join('')
  )
}

function renderActivity() {
  if (!lastActivity || lastActivity.length === 0) {
    setHtml('ov-activity', `<div class="text-xs text-text-muted py-3">Chưa có hoạt động nào.</div>`)
    return
  }

  setHtml(
    'ov-activity',
    lastActivity
      .slice(0, 6)
      .map((r) => {
        const minutes = r.purchased_at ? Math.round((Date.now() - new Date(r.purchased_at).getTime()) / 60000) : 0
        return `
        <div class="flex items-center gap-3 py-2.5">
          <span class="w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.is_manual ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
          <div class="flex-1 min-w-0 text-xs leading-snug">
            <span class="font-bold text-text-primary">${escapeHtml(r.user_name || 'Học viên')}</span>
            <span class="text-text-muted"> mở khoá </span>
            <span class="font-bold text-accent-primary">${escapeHtml(r.song_title || r.song_id)}</span>
          </div>
          <span class="hidden sm:inline px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${
            r.is_manual ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          }">${r.is_manual ? 'Cấp tay' : 'Tự động'}</span>
          <span class="text-[10px] text-text-muted flex-shrink-0 w-20 text-right">${formatAge(minutes)}</span>
        </div>`
      })
      .join('')
  )
}

// ----------------------------------------------------------------------------
// Nạp dữ liệu
// ----------------------------------------------------------------------------
function renderAll() {
  renderAttention()
  if (lastStats) {
    renderKpis(lastStats)
    renderChart(lastStats)
    renderTopSongs(lastStats.top_songs || [])
  }
  renderActivity()

  const stamp = document.getElementById('ov-updated')
  if (stamp) {
    stamp.textContent = `Cập nhật ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
  }
}

export async function loadOverview() {
  // Ba nguồn độc lập — một nguồn lỗi không được làm trắng cả trang.
  const [statsRes, paymentsRes, activityRes] = await Promise.allSettled([
    supabase.rpc('admin_get_overview_stats'),
    fetchUnmatchedTransactions(),
    supabase.rpc('admin_get_recent_purchases'),
  ])

  if (statsRes.status === 'fulfilled' && !statsRes.value.error) {
    lastStats = statsRes.value.data || {}
  } else {
    const err = statsRes.status === 'rejected' ? statsRes.reason : statsRes.value.error
    console.error('Error loading overview:', err)
    showToast('Lỗi khi tải số liệu tổng quan: ' + (err?.message || 'không rõ'), 'error')
  }

  if (paymentsRes.status === 'fulfilled') {
    lastPayments = paymentsRes.value
    updateOrdersBadge(lastPayments.setupNeeded ? 0 : lastPayments.list.length)
  } else {
    console.error('Error loading unmatched transactions for overview:', paymentsRes.reason)
  }

  if (activityRes.status === 'fulfilled' && !activityRes.value.error) {
    lastActivity = activityRes.value.data || []
  }

  renderAll()
}

export function initOverviewSection() {
  document.getElementById('ov-refresh')?.addEventListener('click', async () => {
    await loadOverview()
    showToast('✓ Đã làm mới số liệu', 'success')
  })

  document.getElementById('ov-chart-range')?.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      chartRange = Number(btn.dataset.range) === 30 ? 30 : 7
      try {
        localStorage.setItem(CHART_RANGE_KEY, String(chartRange))
      } catch {
        /* không lưu được thì thôi, chỉ mất ghi nhớ lựa chọn */
      }
      if (lastStats) renderChart(lastStats)
    })
  })
}
