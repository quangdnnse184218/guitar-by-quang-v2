/**
 * ==============================================================================
 * ADMIN DASHBOARD — TỔNG QUAN
 * ==============================================================================
 * Số liệu lấy trong đúng 1 lần gọi RPC admin_get_overview_stats() (tính sẵn ở
 * phía database) thay vì tải hết đơn hàng về rồi cộng ở trình duyệt — nhanh
 * hơn và không phải gửi toàn bộ dữ liệu đơn hàng ra client chỉ để hiện vài con
 * số tổng.
 */
import { supabase } from '../lib/supabase.js'
import { showToast } from './toast.js'

const ovRevenueToday = document.getElementById('ov-revenue-today')
const ovRevenueMonth = document.getElementById('ov-revenue-month')
const ovRevenueTotal = document.getElementById('ov-revenue-total')
const ovOrdersPaid = document.getElementById('ov-orders-paid')
const ovOrdersPaidMonth = document.getElementById('ov-orders-paid-month')
const ovOrdersPending = document.getElementById('ov-orders-pending')
const ovUsersTotal = document.getElementById('ov-users-total')
const ovUsersNew = document.getElementById('ov-users-new')
const ovChart = document.getElementById('ov-chart')
const ovTopSongs = document.getElementById('ov-top-songs')

function formatVnd(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ'
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Số đơn chưa hoàn tất — dùng chung cho badge trên tab Đơn Hàng. */
export let pendingOrdersCount = 0

function renderChart(days) {
  if (!ovChart) return
  ovChart.innerHTML = ''

  const maxRevenue = Math.max(...days.map((d) => Number(d.revenue) || 0), 1)

  days.forEach((d) => {
    const revenue = Number(d.revenue) || 0
    // Cột 0đ vẫn để lại một vạch mỏng để nhìn ra "ngày này không có doanh thu"
    // thay vì biến mất hẳn khỏi biểu đồ.
    const heightPct = revenue > 0 ? Math.max((revenue / maxRevenue) * 100, 6) : 2

    const col = document.createElement('div')
    col.className = 'flex-1 flex flex-col items-center justify-end gap-1.5 h-full group'
    col.innerHTML = `
      <span class="text-[10px] font-mono font-bold text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        ${revenue > 0 ? formatVnd(revenue) : '0đ'}
      </span>
      <div class="w-full rounded-t-lg ${revenue > 0 ? 'bg-warm-gradient' : 'bg-black/10 dark:bg-white/10'} transition-all" style="height: ${heightPct}%"></div>
      <span class="text-[10px] text-text-muted font-medium">${escapeHtml(d.label)}</span>
    `
    ovChart.appendChild(col)
  })
}

function renderTopSongs(songs) {
  if (!ovTopSongs) return
  ovTopSongs.innerHTML = ''

  if (!songs || songs.length === 0) {
    ovTopSongs.innerHTML = `<li class="text-text-muted text-xs">Chưa có dữ liệu.</li>`
    return
  }

  const max = Math.max(...songs.map((s) => Number(s.sold_count) || 0), 1)

  songs.forEach((s, i) => {
    const count = Number(s.sold_count) || 0
    const li = document.createElement('li')
    li.className = 'space-y-1'
    li.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="truncate font-bold text-text-primary">
          <span class="text-text-muted font-mono mr-1">${i + 1}.</span>${escapeHtml(s.song_title)}
        </span>
        <span class="font-mono font-bold text-accent-primary flex-shrink-0">${count}</span>
      </div>
      <div class="h-1.5 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
        <div class="h-full rounded-full bg-warm-gradient" style="width: ${(count / max) * 100}%"></div>
      </div>
    `
    ovTopSongs.appendChild(li)
  })
}

export async function loadOverview() {
  try {
    const { data, error } = await supabase.rpc('admin_get_overview_stats')
    if (error) throw error
    const s = data || {}

    pendingOrdersCount = Number(s.orders_pending_total) || 0

    if (ovRevenueToday) ovRevenueToday.textContent = formatVnd(s.revenue_today)
    if (ovRevenueMonth) ovRevenueMonth.textContent = `Tháng này: ${formatVnd(s.revenue_month)}`
    if (ovRevenueTotal) ovRevenueTotal.textContent = `Tổng: ${formatVnd(s.revenue_total)}`
    if (ovOrdersPaid) ovOrdersPaid.textContent = Number(s.orders_paid_total) || 0
    if (ovOrdersPaidMonth)
      ovOrdersPaidMonth.textContent = `Tháng này: ${Number(s.orders_paid_month) || 0} đơn`
    if (ovOrdersPending) ovOrdersPending.textContent = pendingOrdersCount
    if (ovUsersTotal) ovUsersTotal.textContent = Number(s.users_total) || 0
    if (ovUsersNew) ovUsersNew.textContent = `7 ngày qua: +${Number(s.users_new_week) || 0}`

    renderChart(s.revenue_last_7_days || [])
    renderTopSongs(s.top_songs || [])

    updateOrdersBadge()
  } catch (err) {
    console.error('Error loading overview:', err)
    showToast('Lỗi khi tải số liệu tổng quan: ' + err.message, 'error')
  }
}

/** Badge đỏ trên tab Đơn Hàng — chỉ hiện khi thực sự có đơn chưa hoàn tất. */
export function updateOrdersBadge(count = pendingOrdersCount) {
  const badge = document.getElementById('tab-badge-orders')
  if (!badge) return
  pendingOrdersCount = count
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}

export function initOverviewSection() {
  document.getElementById('ov-quick-refresh')?.addEventListener('click', () => {
    loadOverview()
    showToast('✓ Đã làm mới số liệu', 'info')
  })

  document.getElementById('ov-pending-card')?.addEventListener('click', () => {
    window.switchTab?.('grant')
  })

  document.getElementById('ov-quick-grant')?.addEventListener('click', () => {
    window.switchTab?.('grant')
    document.getElementById('grant-user-search')?.focus()
  })

  document.getElementById('ov-quick-users')?.addEventListener('click', () => {
    window.switchTab?.('users')
  })

  document.getElementById('ov-quick-add-song')?.addEventListener('click', () => {
    window.switchTab?.('content')
    window.openAddSongModal?.('free')
  })
}
