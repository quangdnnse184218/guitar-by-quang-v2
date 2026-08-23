/**
 * Shared utility functions across all pages
 */
import { supabase } from './lib/supabase.js'

/**
 * Renders the 3 ambient floating blurred blobs in the background.
 */
export function renderAmbientBlobs() {
  if (document.getElementById('ambient-blobs-root')) return

  const container = document.createElement('div')
  container.id = 'ambient-blobs-root'
  container.className = 'ambient-blobs-container'
  container.setAttribute('aria-hidden', 'true')
  container.innerHTML = `
    <div class="ambient-blob blob-amber"></div>
    <div class="ambient-blob blob-violet"></div>
    <div class="ambient-blob blob-rose"></div>
  `
  document.body.prepend(container)
}

/**
 * Music notes removed as per requirement 7d
 */
export function renderMusicNotes() {
  const existing = document.getElementById('music-notes-root');
  if (existing) existing.remove();
  const existingStyle = document.getElementById('music-notes-style');
  if (existingStyle) existingStyle.remove();
}

/**
 * Initializes the sticky glass navbar shrink effect on scroll.
 */
export function initNavbarShrink() {
  const navbar = document.getElementById('main-nav')
  if (!navbar) return

  const onScroll = () => {
    if (window.scrollY > 60) {
      navbar.classList.add('py-3', 'shadow-lg', 'border-b', 'border-glass-border')
      navbar.classList.remove('py-4', 'py-5')
      navbar.style.backgroundColor = 'var(--header-bg)'
    } else {
      navbar.classList.add('py-4', 'border-b', 'border-glass-border')
      navbar.classList.remove('py-3', 'shadow-lg')
      navbar.style.backgroundColor = ''
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  // Trigger once on init
  onScroll()
}

/**
 * Initializes mobile hamburger navigation drawer
 */
export function initMobileMenu() {
  const toggleBtn = document.getElementById('mobile-menu-btn')
  const menuDrawer = document.getElementById('mobile-menu-drawer')
  const closeBtn = document.getElementById('mobile-menu-close')
  const backdrop = document.getElementById('mobile-menu-backdrop')

  if (!toggleBtn || !menuDrawer) return

  const openMenu = () => {
    menuDrawer.classList.remove('translate-x-full', 'pointer-events-none')
    menuDrawer.classList.add('pointer-events-auto')
    if (backdrop) {
      backdrop.classList.remove('hidden')
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0')
      })
    }
    document.body.style.overflow = 'hidden'
  }

  const closeMenu = () => {
    menuDrawer.classList.add('translate-x-full', 'pointer-events-none')
    menuDrawer.classList.remove('pointer-events-auto')
    if (backdrop) backdrop.classList.add('opacity-0')
    setTimeout(() => {
      if (backdrop) backdrop.classList.add('hidden')
    }, 300)
    document.body.style.overflow = ''
  }

  toggleBtn.addEventListener('click', openMenu)
  if (closeBtn) closeBtn.addEventListener('click', closeMenu)
  if (backdrop) backdrop.addEventListener('click', closeMenu)

  // Close when clicking any nav link inside mobile menu
  menuDrawer.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu)
  })

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menuDrawer.classList.contains('translate-x-full')) {
      closeMenu()
    }
  })
}

/**
 * Checks authentication state and updates the header if user is logged in
 */
export async function initAuthHeader() {
  const desktopContainer = document.getElementById('desktop-auth-container')
  const mobileContainer = document.getElementById('mobile-auth-container')
  
  if (!desktopContainer && !mobileContainer) return

  try {
    const { data: { session } } = await supabase.auth.getSession()

    if (session && session.user) {
      updateHeaderForUser(session.user)
    }

    supabase.auth.onAuthStateChange((event, currentSession) => {
      if (currentSession && currentSession.user) {
        updateHeaderForUser(currentSession.user)
      } else {
        // Option to handle logout if needed, e.g., window.location.reload()
      }
    })
  } catch (err) {
    console.error('Error checking auth state:', err)
  }

  async function updateHeaderForUser(user) {
    let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Thành viên'
    let avatarUrl = user.user_metadata?.avatar_url || ''
    let role = 'user'

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, role')
        .eq('id', user.id)
        .single()

      if (profile) {
        if (profile.full_name) fullName = profile.full_name
        if (profile.avatar_url) avatarUrl = profile.avatar_url
        if (profile.role) role = profile.role
      }
    } catch (e) {
      console.warn('Header profile fetch warning:', e)
    }

    const initial = fullName.charAt(0).toUpperCase()
    
    // Avatar image or initial letter
    const avatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${fullName}" class="w-6 h-6 rounded-full object-cover border border-amber-400/50" />`
      : `<div class="w-6 h-6 rounded-full bg-warm-gradient text-white flex items-center justify-center text-xs font-bold shadow-xs">${initial}</div>`

    const mobileAvatarHtml = avatarUrl
      ? `<img src="${avatarUrl}" alt="${fullName}" class="w-10 h-10 rounded-full object-cover border-2 border-amber-400/60 shadow-sm" />`
      : `<div class="w-10 h-10 rounded-full bg-warm-gradient text-white flex items-center justify-center text-lg font-bold shadow-sm">${initial}</div>`

    const roleBadgeHtml = role === 'admin'
      ? `<span class="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[10px] font-bold border border-purple-500/30">👑 Admin</span>`
      : `<span class="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30">👑 Thành viên</span>`

    const adminDropdownOption = role === 'admin'
      ? `<a href="/admin-dashboard.html" class="block px-4 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors border-b border-glass-border mb-1">⚡ Bảng Quản Trị Admin</a>`
      : ''

    const userDropdownHtml = `
      <div class="relative group">
        <button class="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-glass-bg border border-amber-500/40 hover:border-amber-400 shadow-sm hover:shadow-amber-500/10 transition-all cursor-pointer">
          ${avatarHtml}
          <div class="flex items-center gap-1.5 text-left">
            <span class="text-xs sm:text-sm font-bold text-text-primary hidden sm:inline-block truncate max-w-[110px]">${fullName}</span>
            <span class="hidden md:inline-block">${roleBadgeHtml}</span>
          </div>
          <svg class="w-3.5 h-3.5 text-text-muted transition-transform group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <!-- Dropdown Menu -->
        <div class="absolute right-0 mt-2 w-52 rounded-2xl bg-glass-bg backdrop-blur-2xl border border-glass-border shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
          <div class="px-3 py-2 border-b border-glass-border mb-1">
            <p class="text-xs font-bold text-text-primary truncate">${fullName}</p>
            <p class="text-[10px] text-text-muted truncate">${user.email}</p>
          </div>
          ${adminDropdownOption}
          <a href="/user-dashboard.html" class="block px-3 py-2 text-xs font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary rounded-xl transition-colors flex items-center gap-2">
            <span>🎸</span>
            <span>Trang Của Tôi</span>
          </a>
          <a href="/user-dashboard.html#favorites" class="block px-3 py-2 text-xs font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary rounded-xl transition-colors flex items-center gap-2">
            <span>❤️</span>
            <span>Tab Yêu Thích</span>
          </a>
          <a href="/user-dashboard.html#purchases" class="block px-3 py-2 text-xs font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary rounded-xl transition-colors flex items-center gap-2">
            <span>⚡</span>
            <span>Tab Đã Mua</span>
          </a>
          <a href="/user-dashboard.html#profile" class="block px-3 py-2 text-xs font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary rounded-xl transition-colors flex items-center gap-2">
            <span>👤</span>
            <span>Hồ Sơ & Mật Khẩu</span>
          </a>
          <button id="auth-logout-btn" class="w-full text-left px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors mt-1 border-t border-glass-border flex items-center gap-2 cursor-pointer">
            <span>🚪</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    `

    if (desktopContainer) {
      const themeToggle = desktopContainer.querySelector('#theme-toggle-btn')
      desktopContainer.innerHTML = ''
      
      const userDiv = document.createElement('div')
      userDiv.innerHTML = userDropdownHtml
      desktopContainer.appendChild(userDiv.firstElementChild)
      
      if (themeToggle) desktopContainer.appendChild(themeToggle)
      
      const logoutBtn = desktopContainer.querySelector('#auth-logout-btn')
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          await supabase.auth.signOut()
          window.location.href = '/'
        })
      }
    }

    if (mobileContainer) {
      mobileContainer.innerHTML = `
        <div class="flex items-center justify-between w-full p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-glass-border">
          <div class="flex items-center gap-3">
             ${mobileAvatarHtml}
             <div>
               <div class="flex items-center gap-1.5">
                 <p class="text-sm font-bold text-text-primary">${fullName}</p>
               </div>
               <a href="/user-dashboard.html" class="text-xs text-accent-primary font-bold hover:underline flex items-center gap-1 mt-0.5">
                 <span>Vào Trang Của Tôi →</span>
               </a>
             </div>
          </div>
          <button id="mobile-logout-btn" title="Đăng xuất" class="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      `
      const mobileLogout = mobileContainer.querySelector('#mobile-logout-btn')
      if (mobileLogout) {
        mobileLogout.addEventListener('click', async () => {
          await supabase.auth.signOut()
          window.location.href = '/'
        })
      }
    }
  }
}
document.addEventListener("DOMContentLoaded", initAuthHeader)
