/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN DASHBOARD CMS (admin-dashboard.js)
 * ==============================================================================
 * File này là entry point: auth guard, khung giao diện (sidebar + router) và
 * khởi tạo. Logic từng màn hình nằm ở src/admin/*.js — xem ghi chú đầu mỗi file.
 *
 * Điều hướng do src/admin/router.js lo: mỗi mục quản trị là một route hash
 * riêng thay vì biến `activeTab` trong bộ nhớ, nên F5 hay Back đều không làm
 * mất chỗ đang đứng.
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles } from './common.js'
import { state } from './admin/state.js'
import { toggleModal } from './admin/modal.js'
import { initRouter } from './admin/router.js'
import { loadSongs, initSongsSection } from './admin/songs.js'
import { loadGears, initGearsSection } from './admin/gears.js'
import { loadUsers, initUsersSection } from './admin/users.js'
import { loadPendingOrders, initOrdersSection } from './admin/orders.js'
import { loadPayments, initPaymentsSection } from './admin/payments.js'
import { enterGrantPage, initGrantSection } from './admin/grant.js'
import { loadRecentGrants, loadRecentRevocations, initHistorySection } from './admin/history.js'
import { loadOverview, initOverviewSection } from './admin/overview.js'
import { loadUserDetail } from './admin/user-detail.js'
import { enterSettingsPage, initSettingsSection, renderAdminIdentity } from './admin/settings.js'

// If redirected here with a recovery token, immediately move to admin-reset-password.html
if (
  window.location.hash.includes('type=recovery') ||
  window.location.search.includes('type=recovery')
) {
  window.location.replace(
    '/admin-reset-password.html' + (window.location.hash || window.location.search)
  )
}

initThemeToggle()
initPasswordToggles()

const SIDEBAR_COLLAPSED_KEY = 'gbq_admin_sidebar_collapsed'

// DOM Elements
const logoutBtn = document.getElementById('logout-btn')
const adminHeaderDropdownWrap = document.getElementById('admin-header-dropdown-wrap')
const adminHeaderDropdownBtn = document.getElementById('admin-header-dropdown-btn')

// Sidebar (desktop cố định, mobile trượt ra như drawer)
const adminSidebar = document.getElementById('admin-sidebar')
const sidebarBackdrop = document.getElementById('admin-sidebar-backdrop')
const sidebarOpenBtn = document.getElementById('sidebar-open-btn')
const sidebarCloseBtn = document.getElementById('sidebar-close-btn')
const bottomMenuBtn = document.getElementById('bottom-menu-btn')

// ==========================================================================
// AUTH GUARD
// ==========================================================================

async function checkAuth() {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session || !session.user) {
      window.location.replace('/admin-login.html')
      return false
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name, avatar_url, created_at')
      .eq('id', session.user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    if (!isAdmin) {
      await supabase.auth.signOut()
      window.location.replace('/admin-login.html')
      return false
    }

    state.currentAdminId = session.user.id
    state.adminProfile = { ...profile, email: session.user.email || '' }
    state.adminSession = {
      last_sign_in_at: session.user.last_sign_in_at,
      email_confirmed_at: session.user.email_confirmed_at,
    }
    renderAdminIdentity()
    return true
  } catch (err) {
    console.error('Auth verification error:', err)
    window.location.replace('/admin-login.html')
    return false
  }
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function initDashboard() {
  const isAuthed = await checkAuth()
  if (!isAuthed) return

  // Logout Handler
  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.replace('/admin-login.html')
  })

  // Account Dropdown (Cài đặt / Xem Website / Đăng xuất)
  if (adminHeaderDropdownWrap && adminHeaderDropdownBtn) {
    const closeDropdown = () => {
      adminHeaderDropdownWrap.classList.remove('open')
      adminHeaderDropdownBtn.setAttribute('aria-expanded', 'false')
    }

    adminHeaderDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isOpen = adminHeaderDropdownWrap.classList.toggle('open')
      adminHeaderDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    })

    document.addEventListener('click', (e) => {
      if (!adminHeaderDropdownWrap.contains(e.target)) closeDropdown()
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown()
    })

    // Bấm bất kỳ mục nào bên trong thì đóng menu lại.
    document
      .getElementById('admin-header-dropdown-menu')
      ?.querySelectorAll('a, button')
      .forEach((item) => item.addEventListener('click', closeDropdown))
  }

  // ==========================================================================
  // SIDEBAR (mobile: drawer)
  // ==========================================================================
  function setSidebar(open) {
    adminSidebar?.classList.toggle('is-open', open)
    if (sidebarBackdrop) sidebarBackdrop.hidden = !open
    // Chặn cuộn trang phía sau khi drawer đang mở, nếu không ngón tay kéo
    // drawer sẽ cuộn cả bảng dữ liệu bên dưới.
    document.body.classList.toggle('overflow-hidden', open)
  }

  // Thu gọn sidebar trên desktop. Khi thu gọn chỉ còn icon nên gắn tên mục vào
  // `title` để rê chuột vẫn biết là mục nào.
  document.querySelectorAll('.admin-nav-item').forEach((item) => {
    const label = item.querySelector('span:not(.admin-nav-badge)')?.textContent?.trim()
    if (label) item.title = label
  })

  const adminShell = document.querySelector('.admin-shell')
  const collapseBtn = document.getElementById('sidebar-collapse-btn')

  function setCollapsed(collapsed, persist = true) {
    adminShell?.classList.toggle('is-collapsed', collapsed)
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-pressed', String(collapsed))
      const text = collapsed ? 'Mở rộng menu' : 'Thu gọn menu'
      collapseBtn.setAttribute('aria-label', text)
      collapseBtn.title = text
    }
    if (!persist) return
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* không lưu được thì chỉ mất ghi nhớ, không ảnh hưởng chức năng */
    }
  }

  let savedCollapsed = false
  try {
    savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    /* mặc định mở rộng */
  }
  setCollapsed(savedCollapsed, false)
  collapseBtn?.addEventListener('click', () => setCollapsed(!adminShell.classList.contains('is-collapsed')))

  sidebarOpenBtn?.addEventListener('click', () => setSidebar(true))
  bottomMenuBtn?.addEventListener('click', () => setSidebar(true))
  sidebarCloseBtn?.addEventListener('click', () => setSidebar(false))
  sidebarBackdrop?.addEventListener('click', () => setSidebar(false))

  // Chọn một mục điều hướng thì đóng drawer lại — không thì trang mới bị
  // drawer che mất ngay sau khi bấm.
  document.querySelectorAll('[data-route-link]').forEach((el) => {
    el.addEventListener('click', () => setSidebar(false))
  })

  initSongsSection()
  initGearsSection()
  initUsersSection()
  initOrdersSection()
  initPaymentsSection()
  initGrantSection()
  initHistorySection()
  initOverviewSection()
  initSettingsSection()

  // ==========================================================================
  // ROUTER — mỗi mục quản trị là một route, vào route nào thì nạp dữ liệu đó
  // ==========================================================================
  initRouter((route, param) => {
    state.activeTab = route
    setSidebar(false)

    switch (route) {
      case 'tong-quan':
        loadOverview()
        break
      case 'kho-tab':
        loadSongs()
        break
      case 'do-nghe':
        loadGears()
        break
      case 'tien-ve':
        loadPayments()
        break
      case 'don-hang':
        loadPendingOrders()
        break
      case 'cap-quyen':
        enterGrantPage()
        break
      case 'lich-su':
        loadRecentGrants()
        loadRecentRevocations()
        break
      case 'thanh-vien':
        loadUsers()
        break
      case 'thanh-vien-chi-tiet':
        loadUserDetail(param)
        break
      case 'cai-dat':
        enterSettingsPage()
        break
    }
  })

  // Escape đóng modal đang mở (trừ #confirm-modal — modal đó tự xử lý Escape
  // bên trong confirm.js để còn resolve được Promise là "đã huỷ").
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    ;['song-modal', 'gear-modal'].forEach((id) => {
      const modal = document.getElementById(id)
      if (modal && !modal.classList.contains('pointer-events-none')) toggleModal(modal, false)
    })
  })

  // Nạp dữ liệu nền: initRouter() ở trên đã nạp dữ liệu cho đúng route đang
  // mở, phần này lo những thứ mà route khác cần sẵn — danh sách user cho ô
  // tìm khách, và số khoản tiền chưa khớp cho badge đỏ trên sidebar (phải thấy ngay dù đang
  // đứng ở trang nào).
  loadUsers()
  loadPayments()
}

document.addEventListener('DOMContentLoaded', initDashboard)
