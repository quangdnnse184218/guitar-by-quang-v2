/**
 * ==============================================================================
 * GUITAR BY QUANG — THEME TOGGLE MODULE (LIGHT / DARK MODE)
 * ==============================================================================
 */

const STORAGE_KEY = 'gbq_theme'
const themeListeners = new Set()

/**
 * Lấy theme hiện tại đang lưu. Mặc định là 'light'.
 * @returns {'light' | 'dark'}
 */
export function getPreferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'dark') {
    return 'dark'
  }
  // Mặc định luôn là 'light' theo yêu cầu người dùng
  return 'light'
}

/**
 * Áp dụng theme lên document và phát tín hiệu cho các listener (như Three.js scene)
 * @param {'light' | 'dark'} theme 
 * @param {boolean} persist 
 */
export function applyTheme(theme, persist = true) {
  const root = document.documentElement
  
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
    root.classList.remove('dark')
  } else {
    root.removeAttribute('data-theme')
    root.classList.add('dark')
  }

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (e) {
      console.warn('Không thể lưu theme vào localStorage:', e)
    }
  }

  // Update ARIA labels and state on all theme toggle buttons if present
  const toggleButtons = document.querySelectorAll('#theme-toggle-btn, .theme-toggle-btn')
  toggleButtons.forEach(btn => {
    btn.setAttribute('aria-checked', theme === 'light' ? 'false' : 'true')
    btn.setAttribute('title', theme === 'light' ? 'Chuyển sang giao diện Tối' : 'Chuyển sang giao diện Sáng')
  })

  // Notify listeners (e.g. Three.js light intensity adjustment)
  const isDark = theme === 'dark'
  themeListeners.forEach(listener => {
    try {
      listener(isDark)
    } catch (err) {
      console.error('Error in theme listener:', err)
    }
  })

  if (typeof window.__updateSceneLighting === 'function') {
    window.__updateSceneLighting(isDark)
  }
}

/**
 * Đăng ký listener khi theme thay đổi
 * @param {(isDark: boolean) => void} callback 
 * @returns {() => void} Hàm hủy đăng ký
 */
export function onThemeChange(callback) {
  themeListeners.add(callback)
  return () => themeListeners.delete(callback)
}

/**
 * Khởi tạo Theme Toggle cho trang
 */
export function initThemeToggle() {
  const currentTheme = getPreferredTheme()
  applyTheme(currentTheme, false)

  // Gắn sự kiện cho các nút toggle trên trang
  const attachButtons = () => {
    const toggleButtons = document.querySelectorAll('#theme-toggle-btn, .theme-toggle-btn')
    toggleButtons.forEach(btn => {
      // Remove old listener if re-initializing to avoid duplicate triggers
      btn.onclick = (e) => {
        e.preventDefault()
        const isLight = document.documentElement.getAttribute('data-theme') === 'light'
        const nextTheme = isLight ? 'dark' : 'light'
        applyTheme(nextTheme, true)
      }
    })
  }

  attachButtons()
}
