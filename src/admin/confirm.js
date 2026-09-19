/**
 * ==============================================================================
 * ADMIN DASHBOARD — HỘP THOẠI XÁC NHẬN
 * ==============================================================================
 * Thay cho `confirm()` / `alert()` của trình duyệt trong các thao tác nguy hiểm
 * (xoá tài khoản, thu hồi tab, dọn đơn quá hạn). Lý do đổi:
 *
 *   • `confirm()` hiện hộp thoại hệ điều hành, phá vỡ hoàn toàn giao diện — trên
 *     mobile nó còn ghi cả tên miền và trông như cảnh báo lừa đảo.
 *   • Không xuống dòng, không in đậm, không tô màu được → cảnh báo quan trọng
 *     ("thao tác này xoá sạch lịch sử mua") trôi lẫn trong một khối chữ xám.
 *   • Không kèm được lựa chọn phụ. Riêng thao tác thu hồi cần đúng thứ đó: một
 *     ô tích "gỡ luôn quyền Google Drive" và một ô ghi lý do.
 *
 * Trả về `null` khi admin huỷ, hoặc `{ checkbox, input }` khi admin đồng ý.
 */

const TONES = {
  danger: {
    iconBg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    confirmBtn: 'bg-rose-600 hover:bg-rose-500 text-white',
    icon: '⚠️',
  },
  warn: {
    iconBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    confirmBtn: 'bg-amber-600 hover:bg-amber-500 text-white',
    icon: '⚠️',
  },
  neutral: {
    iconBg: 'bg-accent-primary/15 text-accent-primary',
    confirmBtn: 'bg-warm-gradient hover:brightness-105 text-white',
    icon: '❓',
  },
}

function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.message]           Mô tả chính (cho phép thẻ HTML đơn giản của chính mình).
 * @param {Array<[string, string]>} [opts.detail]   Các dòng "nhãn: giá trị" hiện trong khung xám.
 * @param {'danger'|'warn'|'neutral'} [opts.tone]
 * @param {string} [opts.confirmText]
 * @param {string} [opts.cancelText]
 * @param {{label: string, hint?: string, checked?: boolean}} [opts.checkbox]
 * @param {{label: string, placeholder?: string, maxlength?: number}} [opts.input]
 * @returns {Promise<null | {checkbox: boolean, input: string}>}
 */
export function confirmDialog(opts = {}) {
  const modal = document.getElementById('confirm-modal')
  if (!modal) {
    // Không có modal trong DOM thì vẫn phải chặn được thao tác nguy hiểm, chứ
    // không im lặng cho chạy tiếp.
    const ok = window.confirm(`${opts.title || 'Xác nhận'}\n\n${opts.message || ''}`)
    return Promise.resolve(ok ? { checkbox: !!opts.checkbox?.checked, input: '' } : null)
  }

  const tone = TONES[opts.tone] || TONES.neutral
  const dialog = modal.querySelector('.modal-dialog')
  const iconEl = document.getElementById('confirm-icon')
  const titleEl = document.getElementById('confirm-title')
  const messageEl = document.getElementById('confirm-message')
  const detailEl = document.getElementById('confirm-detail')
  const extraEl = document.getElementById('confirm-extra')
  const okBtn = document.getElementById('confirm-ok')
  const cancelBtn = document.getElementById('confirm-cancel')

  iconEl.className = `w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${tone.iconBg}`
  iconEl.textContent = tone.icon
  titleEl.textContent = opts.title || 'Xác nhận thao tác'
  messageEl.innerHTML = opts.message || ''
  messageEl.classList.toggle('hidden', !opts.message)

  if (opts.detail?.length) {
    detailEl.innerHTML = opts.detail
      .map(
        ([label, value]) => `
        <div class="flex items-start gap-2 justify-between">
          <span class="text-text-muted flex-shrink-0">${escapeHtml(label)}</span>
          <span class="font-bold text-text-primary text-right break-words min-w-0">${escapeHtml(value)}</span>
        </div>`
      )
      .join('')
    detailEl.classList.remove('hidden')
  } else {
    detailEl.innerHTML = ''
    detailEl.classList.add('hidden')
  }

  let extraHtml = ''
  if (opts.checkbox) {
    extraHtml += `
      <label class="flex items-start gap-2.5 cursor-pointer select-none p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border">
        <input type="checkbox" id="confirm-checkbox" ${opts.checkbox.checked !== false ? 'checked' : ''}
          class="mt-0.5 w-4 h-4 rounded accent-accent-primary flex-shrink-0" />
        <span class="min-w-0">
          <span class="block text-xs font-bold text-text-primary">${escapeHtml(opts.checkbox.label)}</span>
          ${opts.checkbox.hint ? `<span class="block text-[11px] text-text-muted mt-0.5 leading-relaxed">${escapeHtml(opts.checkbox.hint)}</span>` : ''}
        </span>
      </label>`
  }
  if (opts.input) {
    extraHtml += `
      <div class="space-y-1.5">
        <label for="confirm-input" class="text-xs font-bold text-text-primary block">${escapeHtml(opts.input.label)}</label>
        <input type="text" id="confirm-input" maxlength="${opts.input.maxlength || 200}"
          placeholder="${escapeHtml(opts.input.placeholder || '')}"
          class="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-glass-border text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary" />
      </div>`
  }
  extraEl.innerHTML = extraHtml
  extraEl.classList.toggle('hidden', !extraHtml)

  okBtn.textContent = opts.confirmText || 'Xác nhận'
  okBtn.className = `px-5 py-2.5 rounded-full font-bold text-xs transition-all shadow-sm cursor-pointer active:scale-95 ${tone.confirmBtn}`
  cancelBtn.textContent = opts.cancelText || 'Huỷ'

  // Mở modal
  modal.classList.remove('opacity-0', 'pointer-events-none')
  dialog?.classList.remove('scale-95')
  dialog?.classList.add('scale-100')

  const lastFocused = document.activeElement
  setTimeout(() => cancelBtn.focus(), 60)

  return new Promise((resolve) => {
    function cleanup() {
      modal.classList.add('opacity-0', 'pointer-events-none')
      dialog?.classList.add('scale-95')
      dialog?.classList.remove('scale-100')
      okBtn.removeEventListener('click', onOk)
      cancelBtn.removeEventListener('click', onCancel)
      modal.removeEventListener('click', onBackdrop)
      document.removeEventListener('keydown', onKey)
      if (lastFocused instanceof HTMLElement) lastFocused.focus()
    }

    function onOk() {
      const result = {
        checkbox: document.getElementById('confirm-checkbox')?.checked ?? false,
        input: document.getElementById('confirm-input')?.value?.trim() ?? '',
      }
      cleanup()
      resolve(result)
    }

    function onCancel() {
      cleanup()
      resolve(null)
    }

    function onBackdrop(e) {
      if (e.target === modal) onCancel()
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && e.target?.id !== 'confirm-input') {
        e.preventDefault()
        onOk()
      }
    }

    okBtn.addEventListener('click', onOk)
    cancelBtn.addEventListener('click', onCancel)
    modal.addEventListener('click', onBackdrop)
    document.addEventListener('keydown', onKey)
  })
}
