/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — ADMIN DASHBOARD CMS (admin-dashboard.js)
 * ==============================================================================
 * File này là entry point, chỉ còn auth guard, tab switcher, đổi mật khẩu và
 * khởi tạo. Logic CRUD theo từng mảng (songs/gears/users&grant) đã tách sang
 * src/admin/*.js — xem ghi chú ở đầu mỗi file đó.
 */

import { supabase } from './lib/supabase.js'
import { initThemeToggle } from './theme-toggle.js'
import { initPasswordToggles } from './common.js'
import { state } from './admin/state.js'
import { showToast } from './admin/toast.js'
import { toggleModal } from './admin/modal.js'
import { loadSongs, initSongsSection } from './admin/songs.js'
import { loadGears, initGearsSection } from './admin/gears.js'
import {
  loadUsers,
  loadRecentGrants,
  renderPaidSongs,
  initUsersGrantSection,
} from './admin/users-grant.js'

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

// DOM Elements
const adminUserEmail = document.getElementById('admin-user-email')
const adminDropdownEmail = document.getElementById('admin-dropdown-email')
const logoutBtn = document.getElementById('logout-btn')
const adminHeaderDropdownWrap = document.getElementById('admin-header-dropdown-wrap')
const adminHeaderDropdownBtn = document.getElementById('admin-header-dropdown-btn')
const tabNavSongs = document.getElementById('tab-nav-songs')
const tabNavGears = document.getElementById('tab-nav-gears')
const tabNavUsers = document.getElementById('tab-nav-users')
const tabNavGrant = document.getElementById('tab-nav-grant')
const sectionSongs = document.getElementById('section-songs')
const sectionGears = document.getElementById('section-gears')
const sectionUsers = document.getElementById('section-users')
const sectionGrant = document.getElementById('section-grant')

// Codes Modal DOM (đóng modal — tính năng "generate code" bên trong đã bị gỡ
// từ trước, chỉ còn nút đóng modal còn hoạt động trong HTML)
const codesModal = document.getElementById('codes-modal')
const closeCodesModal = document.getElementById('close-codes-modal')

// Change Password DOM
const openChangePasswordBtn = document.getElementById('open-change-password-btn')
const changePasswordModal = document.getElementById('change-password-modal')
const closeChangePasswordModal = document.getElementById('close-change-password-modal')
const cancelChangePasswordBtn = document.getElementById('cancel-change-password-btn')
const changePasswordForm = document.getElementById('change-password-form')
const adminNewPassword = document.getElementById('admin-new-password')
const adminConfirmPassword = document.getElementById('admin-confirm-password')
const changePwdError = document.getElementById('change-pwd-error')
const changePwdErrorText = document.getElementById('change-pwd-error-text')
const savePasswordBtn = document.getElementById('save-password-btn')
const savePasswordText = document.getElementById('save-password-text')
const savePasswordSpinner = document.getElementById('save-password-spinner')

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
      .select('role')
      .eq('id', session.user.id)
      .single()

    const isAdmin = profile?.role === 'admin'

    if (!isAdmin) {
      await supabase.auth.signOut()
      window.location.replace('/admin-login.html')
      return false
    }

    state.currentAdminId = session.user.id

    if (adminUserEmail) {
      adminUserEmail.textContent = session.user.email || 'Admin'
    }
    if (adminDropdownEmail) {
      adminDropdownEmail.textContent = session.user.email || 'Admin'
    }
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
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.replace('/admin-login.html')
    })
  }

  // Account Dropdown (Đổi mật khẩu / Xem Website / Đăng xuất)
  if (adminHeaderDropdownWrap && adminHeaderDropdownBtn) {
    adminHeaderDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isOpen = adminHeaderDropdownWrap.classList.toggle('open')
      adminHeaderDropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
    })

    document.addEventListener('click', (e) => {
      if (!adminHeaderDropdownWrap.contains(e.target)) {
        adminHeaderDropdownWrap.classList.remove('open')
        adminHeaderDropdownBtn.setAttribute('aria-expanded', 'false')
      }
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && adminHeaderDropdownWrap.classList.contains('open')) {
        adminHeaderDropdownWrap.classList.remove('open')
        adminHeaderDropdownBtn.setAttribute('aria-expanded', 'false')
      }
    })

    // Đóng dropdown khi bấm bất kỳ mục nào bên trong (trừ nút Đổi mật khẩu,
    // vì nó chỉ mở modal — vẫn nên đóng dropdown lại để không che modal)
    document
      .getElementById('admin-header-dropdown-menu')
      ?.querySelectorAll('a, button')
      .forEach((item) => {
        item.addEventListener('click', () => {
          adminHeaderDropdownWrap.classList.remove('open')
          adminHeaderDropdownBtn.setAttribute('aria-expanded', 'false')
        })
      })
  }

  // Tab Switcher Helper
  function switchTab(tabId) {
    state.activeTab = tabId

    // Default inactive and active classes supporting 2x2 grid on mobile and flex on desktop
    const baseClass =
      'px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 text-center'
    const inactiveClass = `${baseClass} text-text-muted hover:text-text-primary`
    const activeClass = `${baseClass} bg-warm-gradient text-white shadow-xs`

    if (tabNavSongs) tabNavSongs.className = tabId === 'songs' ? activeClass : inactiveClass
    if (tabNavGears) tabNavGears.className = tabId === 'gears' ? activeClass : inactiveClass
    if (tabNavUsers) tabNavUsers.className = tabId === 'users' ? activeClass : inactiveClass
    if (tabNavGrant) tabNavGrant.className = tabId === 'grant' ? activeClass : inactiveClass

    if (sectionSongs) sectionSongs.classList.toggle('hidden', tabId !== 'songs')
    if (sectionGears) sectionGears.classList.toggle('hidden', tabId !== 'gears')
    if (sectionUsers) sectionUsers.classList.toggle('hidden', tabId !== 'users')
    if (sectionGrant) sectionGrant.classList.toggle('hidden', tabId !== 'grant')

    if (tabId === 'songs') loadSongs()
    if (tabId === 'gears') loadGears()
    if (tabId === 'users') loadUsers()
    if (tabId === 'grant') {
      renderPaidSongs()
      loadRecentGrants()
    }
  }

  window.switchTab = switchTab

  if (tabNavSongs) tabNavSongs.addEventListener('click', () => switchTab('songs'))
  if (tabNavGears) tabNavGears.addEventListener('click', () => switchTab('gears'))
  if (tabNavUsers) tabNavUsers.addEventListener('click', () => switchTab('users'))
  if (tabNavGrant) tabNavGrant.addEventListener('click', () => switchTab('grant'))

  initSongsSection()
  initGearsSection()
  initUsersGrantSection()

  if (closeCodesModal) {
    closeCodesModal.addEventListener('click', () => toggleModal(codesModal, false))
  }

  // ==========================================================================
  // CHANGE PASSWORD HANDLERS
  // ==========================================================================
  function showChangePwdError(msg) {
    if (!changePwdError || !changePwdErrorText) return
    changePwdErrorText.textContent = msg
    changePwdError.classList.remove('hidden')
  }

  function hideChangePwdError() {
    if (changePwdError) changePwdError.classList.add('hidden')
  }

  window.openChangePasswordModal = function () {
    hideChangePwdError()
    if (adminNewPassword) {
      adminNewPassword.value = ''
      adminNewPassword.type = 'password'
    }
    if (adminConfirmPassword) {
      adminConfirmPassword.value = ''
      adminConfirmPassword.type = 'password'
    }
    toggleModal(changePasswordModal, true)
    setTimeout(() => adminNewPassword?.focus(), 150)
  }

  if (openChangePasswordBtn) {
    openChangePasswordBtn.addEventListener('click', window.openChangePasswordModal)
  }

  if (closeChangePasswordModal) {
    closeChangePasswordModal.addEventListener('click', () =>
      toggleModal(changePasswordModal, false)
    )
  }

  if (cancelChangePasswordBtn) {
    cancelChangePasswordBtn.addEventListener('click', () => toggleModal(changePasswordModal, false))
  }

  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideChangePwdError()

      const newPwd = adminNewPassword?.value || ''
      const confirmPwd = adminConfirmPassword?.value || ''

      if (!newPwd || newPwd.length < 6) {
        showChangePwdError('Mật khẩu mới phải có tối thiểu 6 ký tự!')
        return
      }

      if (newPwd !== confirmPwd) {
        showChangePwdError('Xác nhận mật khẩu không khớp. Vui lòng nhập lại chính xác!')
        return
      }

      if (savePasswordBtn) savePasswordBtn.disabled = true
      if (savePasswordText) savePasswordText.textContent = 'Đang cập nhật...'
      if (savePasswordSpinner) savePasswordSpinner.classList.remove('hidden')

      try {
        const { error } = await supabase.auth.updateUser({
          password: newPwd,
        })

        if (error) {
          showChangePwdError(`Đổi mật khẩu thất bại: ${error.message}`)
          return
        }

        showToast('✓ Đã cập nhật mật khẩu Admin thành công!', 'success')
        toggleModal(changePasswordModal, false)
        if (adminNewPassword) adminNewPassword.value = ''
        if (adminConfirmPassword) adminConfirmPassword.value = ''
      } catch (err) {
        showChangePwdError(`Lỗi kết nối máy chủ: ${err.message}`)
      } finally {
        if (savePasswordBtn) savePasswordBtn.disabled = false
        if (savePasswordText) savePasswordText.textContent = 'Cập Nhật Mật Khẩu'
        if (savePasswordSpinner) savePasswordSpinner.classList.add('hidden')
      }
    })
  }

  // Load initial data
  loadSongs().then(() => renderPaidSongs())
  loadGears()
  loadUsers()
  loadRecentGrants()
}

document.addEventListener('DOMContentLoaded', initDashboard)
