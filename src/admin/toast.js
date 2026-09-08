/**
 * Toast notification dùng chung cho mọi module con của admin-dashboard.
 */
let toastTimer = null

export function showToast(msg, type = 'success') {
  const toastNotification = document.getElementById('toast-notification')
  const toastMessage = document.getElementById('toast-message')
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)

  const toastIcon = document.getElementById('toast-icon')

  // Clean message: strip leading checkmarks/crosses to avoid duplication
  const cleanMsg = msg.replace(/^[✓✕❌⟳•\s]+/, '').trim()
  toastMessage.textContent = cleanMsg || msg

  // Reset and apply dedicated toast class
  toastNotification.className = `toast-${type} toast-visible`

  if (toastIcon) {
    if (type === 'error') {
      toastIcon.textContent = '✕'
      toastIcon.className = ''
    } else if (type === 'info') {
      toastIcon.textContent = '⟳'
      toastIcon.className = 'animate-spin'
    } else {
      toastIcon.textContent = '✓'
      toastIcon.className = ''
    }
  }

  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('toast-visible')
  }, 4000)
}

window.showToast = showToast
