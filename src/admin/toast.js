/**
 * Toast notification dùng chung cho mọi module con của admin-dashboard.
 */
let toastTimer = null

// Biểu tượng Phosphor (bold) dán sẵn — xem scripts/ph-icon.cjs.
const TOAST_ICONS = {
  success: '<svg class="w-4 h-4 flex-shrink-0" aria-hidden="true" data-ph="check" viewBox="0 0 256 256" fill="currentColor"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>',
  error: '<svg class="w-4 h-4 flex-shrink-0" aria-hidden="true" data-ph="x" viewBox="0 0 256 256" fill="currentColor"><path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/></svg>',
  info: '<svg class="w-4 h-4 flex-shrink-0" aria-hidden="true" data-ph="circle-notch" viewBox="0 0 256 256" fill="currentColor"><path d="M236,128a108,108,0,0,1-216,0c0-42.52,24.73-81.34,63-98.9A12,12,0,1,1,93,50.91C63.24,64.57,44,94.83,44,128a84,84,0,0,0,168,0c0-33.17-19.24-63.43-49-77.09A12,12,0,1,1,173,29.1C211.27,46.66,236,85.48,236,128Z"/></svg>',
}

export function showToast(msg, type = 'success') {
  const toastNotification = document.getElementById('toast-notification')
  const toastMessage = document.getElementById('toast-message')
  if (!toastNotification || !toastMessage) return
  if (toastTimer) clearTimeout(toastTimer)

  const toastIcon = document.getElementById('toast-icon')

  // Bỏ ký hiệu ✓ / ❌ / ⚠️ ở đầu câu: biểu tượng của toast đã nói điều đó rồi.
  const cleanMsg = String(msg)
    .replace(/^(?:[\u2713\u2715\u274C\u26A0\u27F3\u2022\s]|\uFE0F)+/u, '')
    .trim()
  toastMessage.textContent = cleanMsg || msg

  // Reset and apply dedicated toast class
  toastNotification.className = `toast-${type} toast-visible`

  if (toastIcon) {
    toastIcon.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.success
    toastIcon.className = type === 'info' ? 'animate-spin' : ''
  }

  toastTimer = setTimeout(() => {
    toastNotification.classList.remove('toast-visible')
  }, 4000)
}

window.showToast = showToast
