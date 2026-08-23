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

  function updateHeaderForUser(user) {
    // Generate an avatar initial
    const initial = user.email ? user.email.charAt(0).toUpperCase() : 'U'
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
    
    const userDropdownHtml = `
      <div class="relative group">
        <button class="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-glass-bg border border-glass-border hover:bg-glass-bg-hover transition-colors">
          <div class="w-6 h-6 rounded-full bg-accent-primary text-white flex items-center justify-center text-xs font-bold">
            ${initial}
          </div>
          <span class="text-sm font-semibold text-text-primary hidden sm:block truncate max-w-[100px]">${name}</span>
          <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <!-- Dropdown Menu -->
        <div class="absolute right-0 mt-2 w-48 rounded-xl bg-glass-bg backdrop-blur-xl border border-glass-border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
          <div class="p-2">
            <a href="#" class="block px-4 py-2 text-sm text-text-primary hover:bg-glass-bg-hover rounded-lg transition-colors">Dashboard</a>
            <button id="auth-logout-btn" class="w-full text-left px-4 py-2 text-sm text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors mt-1">Đăng xuất</button>
          </div>
        </div>
      </div>
    `

    if (desktopContainer) {
      // Keep only the theme toggle, replace register/login
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
          window.location.reload()
        })
      }
    }

    if (mobileContainer) {
      // In mobile menu, replace the auth buttons
      mobileContainer.innerHTML = `
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-full bg-accent-primary text-white flex items-center justify-center text-lg font-bold">
               ${initial}
             </div>
             <div>
               <p class="text-sm font-bold text-text-primary">${name}</p>
               <a href="#" class="text-xs text-accent-primary hover:underline">Vào Dashboard</a>
             </div>
          </div>
          <button id="mobile-logout-btn" class="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
          </button>
        </div>
      `
      const mobileLogout = mobileContainer.querySelector('#mobile-logout-btn')
      if (mobileLogout) {
        mobileLogout.addEventListener('click', async () => {
          await supabase.auth.signOut()
          window.location.reload()
        })
      }
    }
  }
}
document.addEventListener("DOMContentLoaded", initAuthHeader)
