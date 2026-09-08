/**
 * Helper mở/đóng modal dùng chung cho mọi module con của admin-dashboard.
 */
export function toggleModal(modalEl, show = true) {
  if (!modalEl) return
  const dialog = modalEl.querySelector('.modal-dialog')

  if (show) {
    modalEl.classList.remove('opacity-0', 'pointer-events-none')
    modalEl.classList.add('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.remove('scale-95')
      dialog.classList.add('scale-100')
    }
  } else {
    modalEl.classList.add('opacity-0', 'pointer-events-none')
    modalEl.classList.remove('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.add('scale-95')
      dialog.classList.remove('scale-100')
    }
  }
}
