/**
 * ==============================================================================
 * ADMIN DASHBOARD — CÀI ĐẶT TÀI KHOẢN
 * ==============================================================================
 * Trước đây chỉ có một modal "Đổi mật khẩu" giấu trong menu. Giờ là một trang
 * có 3 nhóm:
 *   • Hồ sơ    — tên hiển thị, ảnh đại diện (hiện cả ở góc phải trên cùng)
 *   • Bảo mật  — đổi mật khẩu, đăng xuất khỏi mọi thiết bị, thông tin phiên
 *   • Giao diện — sáng / tối
 *
 * Bảng `profiles` chỉ cho tài khoản đăng nhập sửa đúng 2 cột `full_name` và
 * `avatar_url` của chính mình (`role` bị khoá ở mức cột), nên admin đổi hồ sơ ở
 * đây không thể vô tình hay cố ý tự nâng quyền.
 */
import { supabase } from '../lib/supabase.js'
import { state } from './state.js'
import { showToast } from './toast.js'
import { confirmDialog } from './confirm.js'
import { escapeHtml, formatDate, formatDateTime, avatarUrlFor, copyText } from './format.js'
import { uploadToStorage, removeFromStorageByUrl } from '../lib/storage-service.js'
import { applyTheme } from '../theme-toggle.js'
import { getPasswordWeaknessReason, initPasswordMatchHint } from '../common.js'

const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024
const AVATAR_OUTPUT_SIZE = 512
const NAME_MAX_LENGTH = 60

const profileForm = document.getElementById('settings-profile-form')
const avatarImg = document.getElementById('settings-avatar-img')
const avatarFile = document.getElementById('settings-avatar-file')
const avatarRemoveBtn = document.getElementById('settings-avatar-remove')
const nameInput = document.getElementById('settings-name')
const emailEl = document.getElementById('settings-email')
const joinedEl = document.getElementById('settings-joined')
const uuidEl = document.getElementById('settings-uuid')
const uuidCopyBtn = document.getElementById('settings-uuid-copy')
const saveProfileBtn = document.getElementById('settings-save-profile')
const sessionInfoEl = document.getElementById('settings-session-info')
const signOutAllBtn = document.getElementById('settings-signout-all')

const passwordForm = document.getElementById('change-password-form')
const newPassword = document.getElementById('admin-new-password')
const confirmPassword = document.getElementById('admin-confirm-password')
const pwdError = document.getElementById('change-pwd-error')
const pwdErrorText = document.getElementById('change-pwd-error-text')
const savePasswordBtn = document.getElementById('save-password-btn')
const savePasswordText = document.getElementById('save-password-text')
const savePasswordSpinner = document.getElementById('save-password-spinner')

/** Ảnh mới đã chọn nhưng chưa lưu (đã cắt vuông + thu nhỏ). */
let pendingAvatarFile = null
let pendingAvatarPreviewUrl = null
/** Admin bấm "Gỡ ảnh" nhưng chưa lưu. */
let avatarMarkedForRemoval = false

// ----------------------------------------------------------------------------
// Hiển thị danh tính admin ở góc phải trên cùng (dùng chung mọi trang)
// ----------------------------------------------------------------------------
export function renderAdminIdentity() {
  const p = state.adminProfile
  if (!p) return

  const name = p.full_name || 'Quản trị viên'

  const headerAvatar = document.getElementById('admin-header-avatar')
  const headerFallback = document.getElementById('admin-header-avatar-fallback')
  if (headerAvatar && headerFallback) {
    if (p.avatar_url) {
      headerAvatar.src = p.avatar_url
      headerAvatar.classList.remove('hidden')
      headerFallback.classList.add('hidden')
    } else {
      headerAvatar.classList.add('hidden')
      headerFallback.classList.remove('hidden')
    }
  }

  const nameEl = document.getElementById('admin-dropdown-name')
  if (nameEl) nameEl.textContent = name

  document.querySelectorAll('[data-admin-email]').forEach((el) => {
    el.textContent = p.email || 'Admin'
  })
}

// ----------------------------------------------------------------------------
// Hồ sơ
// ----------------------------------------------------------------------------
function currentAvatarUrl() {
  if (avatarMarkedForRemoval) return ''
  if (pendingAvatarPreviewUrl) return pendingAvatarPreviewUrl
  return state.adminProfile?.avatar_url || ''
}

function renderAvatarPreview() {
  if (!avatarImg) return
  const url = currentAvatarUrl()
  avatarImg.src =
    url ||
    avatarUrlFor({ full_name: nameInput?.value || state.adminProfile?.full_name, email: state.adminProfile?.email })
  if (avatarRemoveBtn) avatarRemoveBtn.classList.toggle('hidden', !url)
}

function discardPendingAvatar() {
  if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl)
  pendingAvatarPreviewUrl = null
  pendingAvatarFile = null
  avatarMarkedForRemoval = false
  if (avatarFile) avatarFile.value = ''
}

/**
 * Cắt vuông ở giữa và thu nhỏ còn 512px: ảnh chụp điện thoại thường 3–8MB,
 * trong khi ảnh đại diện chỉ hiện ở cỡ vài chục pixel. Nếu trình duyệt không
 * xử lý được thì dùng nguyên file gốc.
 */
async function prepareAvatar(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const out = Math.min(AVATAR_OUTPUT_SIZE, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    canvas
      .getContext('2d')
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    if (!blob) return file
    return new File([blob], 'avatar.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}

async function onAvatarChosen() {
  const file = avatarFile?.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('❌ Vui lòng chọn một file ảnh (JPG, PNG, WebP…)', 'error')
    avatarFile.value = ''
    return
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    showToast('❌ Ảnh quá lớn (tối đa 10MB). Hãy chọn ảnh nhỏ hơn.', 'error')
    avatarFile.value = ''
    return
  }

  const prepared = await prepareAvatar(file)
  if (pendingAvatarPreviewUrl) URL.revokeObjectURL(pendingAvatarPreviewUrl)
  pendingAvatarFile = prepared
  pendingAvatarPreviewUrl = URL.createObjectURL(prepared)
  avatarMarkedForRemoval = false
  renderAvatarPreview()
}

async function saveProfile(e) {
  e.preventDefault()
  const p = state.adminProfile
  if (!p) return

  const fullName = (nameInput?.value || '').trim()
  if (!fullName) {
    showToast('⚠️ Vui lòng nhập tên hiển thị', 'error')
    nameInput?.focus()
    return
  }
  if (fullName.length > NAME_MAX_LENGTH) {
    showToast(`⚠️ Tên tối đa ${NAME_MAX_LENGTH} ký tự`, 'error')
    return
  }

  const nameChanged = fullName !== (p.full_name || '')
  const avatarChanged = !!pendingAvatarFile || avatarMarkedForRemoval
  if (!nameChanged && !avatarChanged) {
    showToast('Chưa có thay đổi nào để lưu', 'info')
    return
  }

  if (saveProfileBtn) {
    saveProfileBtn.disabled = true
    saveProfileBtn.textContent = 'Đang lưu…'
  }

  try {
    const oldAvatar = p.avatar_url || ''
    let avatarUrl = oldAvatar

    if (pendingAvatarFile) {
      avatarUrl = await uploadToStorage(pendingAvatarFile, `avatars/${p.id}`, 'avatar')
    } else if (avatarMarkedForRemoval) {
      avatarUrl = ''
    }

    // update() chứ không phải upsert(): hàng profiles luôn có sẵn, và upsert
    // đòi thêm quyền INSERT mà tài khoản đăng nhập không có.
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, avatar_url: avatarUrl })
      .eq('id', p.id)
    if (error) throw error

    // Chỉ xoá ảnh cũ SAU khi đã lưu thành công, để lỗi giữa chừng không làm
    // mất ảnh đang dùng.
    if (avatarChanged && oldAvatar && oldAvatar !== avatarUrl) await removeFromStorageByUrl(oldAvatar)

    state.adminProfile = { ...p, full_name: fullName, avatar_url: avatarUrl }
    discardPendingAvatar()
    renderAdminIdentity()
    renderAvatarPreview()
    showToast('✓ Đã cập nhật hồ sơ', 'success')
  } catch (err) {
    console.error('Profile update error:', err)
    showToast('❌ Lỗi cập nhật hồ sơ: ' + err.message, 'error')
  } finally {
    if (saveProfileBtn) {
      saveProfileBtn.disabled = false
      saveProfileBtn.textContent = 'Lưu thay đổi'
    }
  }
}

// ----------------------------------------------------------------------------
// Bảo mật
// ----------------------------------------------------------------------------
function showPwdError(msg) {
  if (!pwdError || !pwdErrorText) return
  pwdErrorText.textContent = msg
  pwdError.classList.remove('hidden')
}

function hidePwdError() {
  pwdError?.classList.add('hidden')
}

async function changePassword(e) {
  e.preventDefault()
  hidePwdError()

  const newPwd = newPassword?.value || ''
  const confirmPwd = confirmPassword?.value || ''

  const weakness = getPasswordWeaknessReason(newPwd)
  if (weakness) {
    showPwdError(weakness)
    return
  }
  if (newPwd !== confirmPwd) {
    showPwdError('Xác nhận mật khẩu không khớp. Vui lòng nhập lại chính xác!')
    return
  }

  if (savePasswordBtn) savePasswordBtn.disabled = true
  if (savePasswordText) savePasswordText.textContent = 'Đang cập nhật...'
  savePasswordSpinner?.classList.remove('hidden')

  try {
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    if (error) {
      showPwdError(`Đổi mật khẩu thất bại: ${error.message}`)
      return
    }
    showToast('✓ Đã cập nhật mật khẩu Admin thành công!', 'success')
    passwordForm?.reset()
    document.getElementById('admin-password-match-hint')?.replaceChildren()
  } catch (err) {
    showPwdError(`Lỗi kết nối máy chủ: ${err.message}`)
  } finally {
    if (savePasswordBtn) savePasswordBtn.disabled = false
    if (savePasswordText) savePasswordText.textContent = 'Cập nhật mật khẩu'
    savePasswordSpinner?.classList.add('hidden')
  }
}

async function signOutEverywhere() {
  const answer = await confirmDialog({
    tone: 'warn',
    title: 'Đăng xuất khỏi mọi thiết bị',
    message:
      'Mọi phiên đăng nhập của tài khoản này — trên máy tính, điện thoại, trình duyệt khác — sẽ bị huỷ, ' +
      'kể cả phiên bạn đang dùng. Bạn sẽ phải đăng nhập lại. Dùng khi nghi ngờ có người khác đang đăng nhập tài khoản admin.',
    confirmText: 'Đăng xuất tất cả',
  })
  if (!answer) return

  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) throw error
  } catch (err) {
    console.error(err)
    showToast('❌ Không đăng xuất được: ' + err.message, 'error')
    return
  }
  window.location.replace('/admin-login.html')
}

// ----------------------------------------------------------------------------
// Giao diện
// ----------------------------------------------------------------------------
function renderThemeButtons() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    const on = (btn.dataset.themeChoice === 'light') === isLight
    btn.setAttribute('aria-pressed', String(on))
    btn.className = `flex-1 px-4 py-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
      on
        ? 'border-accent-primary bg-accent-primary/10 text-text-primary'
        : 'border-glass-border text-text-muted hover:text-text-primary hover:border-accent-primary/50'
    }`
  })
}

// ----------------------------------------------------------------------------
// Vào trang / khởi tạo
// ----------------------------------------------------------------------------
export function enterSettingsPage() {
  const p = state.adminProfile
  if (!p) return

  discardPendingAvatar()
  if (nameInput) nameInput.value = p.full_name || ''
  if (emailEl) emailEl.textContent = p.email || '—'
  if (joinedEl) joinedEl.textContent = formatDate(p.created_at)
  if (uuidEl) uuidEl.textContent = p.id
  renderAvatarPreview()
  renderThemeButtons()

  if (sessionInfoEl) {
    const s = state.adminSession || {}
    sessionInfoEl.innerHTML = `
      <div class="flex items-center justify-between gap-3"><dt class="text-text-muted">Đăng nhập gần nhất</dt><dd class="font-bold text-text-primary text-right">${escapeHtml(formatDateTime(s.last_sign_in_at))}</dd></div>
      <div class="flex items-center justify-between gap-3"><dt class="text-text-muted">Xác thực email</dt><dd class="font-bold text-right ${s.email_confirmed_at ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">${s.email_confirmed_at ? 'Đã xác thực' : 'Chưa xác thực'}</dd></div>`
  }
}

export function initSettingsSection() {
  initPasswordMatchHint({
    passwordInputId: 'admin-new-password',
    confirmInputId: 'admin-confirm-password',
    hintElId: 'admin-password-match-hint',
  })

  profileForm?.addEventListener('submit', saveProfile)
  avatarFile?.addEventListener('change', onAvatarChosen)
  nameInput?.addEventListener('input', () => {
    // Ảnh mặc định lấy chữ cái đầu của tên — cập nhật theo khi đang gõ.
    if (!currentAvatarUrl()) renderAvatarPreview()
  })
  avatarRemoveBtn?.addEventListener('click', () => {
    if (pendingAvatarPreviewUrl) {
      // Đang có ảnh mới chưa lưu: bỏ ảnh đó, quay về ảnh đang dùng.
      URL.revokeObjectURL(pendingAvatarPreviewUrl)
      pendingAvatarPreviewUrl = null
      pendingAvatarFile = null
      if (avatarFile) avatarFile.value = ''
    } else {
      avatarMarkedForRemoval = true
    }
    renderAvatarPreview()
  })

  uuidCopyBtn?.addEventListener('click', async () => {
    const ok = await copyText(state.adminProfile?.id || '')
    showToast(ok ? '✓ Đã copy mã tài khoản' : '❌ Không copy được', ok ? 'success' : 'error')
  })

  passwordForm?.addEventListener('submit', changePassword)
  signOutAllBtn?.addEventListener('click', signOutEverywhere)

  document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeChoice, true)
      renderThemeButtons()
    })
  })
  // Nút mặt trời/mặt trăng ở thanh trên cũng đổi theme — giữ hai nơi khớp nhau.
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => setTimeout(renderThemeButtons, 0))
}
