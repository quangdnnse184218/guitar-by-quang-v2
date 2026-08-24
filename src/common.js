import { supabase } from './lib/supabase.js'

/**
 * Universal Password Recovery Intercept:
 * If the user clicks a recovery link from Supabase email and lands on ANY page,
 * immediately redirect them to the dedicated reset password page.
 */
;(function checkPasswordRecoveryIntercept() {
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  const isRecovery = hash.includes('type=recovery') || search.includes('type=recovery')
  const pathname = window.location.pathname

  if (isRecovery && !pathname.includes('reset-password')) {
    const isAdmin = pathname.includes('admin') || hash.includes('role=admin') || search.includes('role=admin')
    const targetUrl = isAdmin ? '/admin-reset-password.html' : '/reset-password.html'
    window.location.replace(`${targetUrl}${hash || search}`)
    return
  }

  // Also listen for Supabase PASSWORD_RECOVERY auth event
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' && !window.location.pathname.includes('reset-password')) {
      const isAdmin = window.location.pathname.includes('admin') || window.location.hash.includes('admin')
      const targetUrl = isAdmin ? '/admin-reset-password.html' : '/reset-password.html'
      window.location.replace(`${targetUrl}${window.location.hash}`)
    }
  })
})()

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

    const userEmail = (user.email || '').toLowerCase()
    const isAdmin = role === 'admin' || 
                    userEmail.includes('quangdnn') || 
                    userEmail.includes('quang') || 
                    userEmail.includes('admin')

    const targetDashboardUrl = isAdmin ? '/admin-dashboard.html' : '/user-dashboard.html'
    const targetDashboardLabel = 'Trang Của Tôi'

    const roleBadgeHtml = isAdmin
      ? `<span class="px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[10px] font-bold border border-purple-500/30">👑 Admin</span>`
      : `<span class="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold border border-amber-500/30">👑 Thành viên</span>`

    const adminDropdownOption = isAdmin
      ? `<a href="/admin-dashboard.html" class="block px-3 py-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 rounded-xl transition-colors flex items-center gap-2 border-b border-glass-border mb-1"><span>⚡</span><span>Bảng Quản Trị Admin</span></a>`
      : ''

    const userDropdownHtml = `
      <div class="relative group" id="user-header-dropdown-wrap">
        <button id="user-header-dropdown-btn" type="button" aria-expanded="false" aria-haspopup="true" class="flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-1.5 rounded-full bg-glass-bg border border-amber-500/40 hover:border-amber-400 shadow-sm hover:shadow-amber-500/10 transition-all cursor-pointer">
          ${avatarHtml}
          <div class="flex items-center gap-1.5 text-left">
            <span class="text-xs sm:text-sm font-bold text-text-primary hidden sm:inline-block truncate max-w-[110px]">${fullName}</span>
            <span class="hidden md:inline-block">${roleBadgeHtml}</span>
          </div>
          <svg id="user-header-dropdown-arrow" class="w-3.5 h-3.5 text-text-muted transition-transform md:group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <!-- Dropdown Menu -->
        <div id="user-header-dropdown-menu" class="absolute right-0 mt-2 w-52 rounded-2xl bg-glass-bg backdrop-blur-2xl border border-glass-border shadow-2xl opacity-0 invisible md:group-hover:opacity-100 md:group-hover:visible transition-all duration-200 z-50 p-2 pointer-events-none md:pointer-events-auto">
          <div class="px-3 py-2 border-b border-glass-border mb-1">
            <p class="text-xs font-bold text-text-primary truncate">${fullName}</p>
            <p class="text-[10px] text-text-muted truncate">${user.email}</p>
          </div>
          ${adminDropdownOption}
          <a href="${targetDashboardUrl}" class="block px-3 py-2 text-xs font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary rounded-xl transition-colors flex items-center gap-2">
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

      // Setup click-to-toggle behavior for mobile touch & accessibility
      const dropdownWrap = desktopContainer.querySelector('#user-header-dropdown-wrap')
      const dropdownBtn = desktopContainer.querySelector('#user-header-dropdown-btn')
      const dropdownMenu = desktopContainer.querySelector('#user-header-dropdown-menu')

      if (dropdownBtn && dropdownWrap) {
        dropdownBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          const isOpen = dropdownWrap.classList.toggle('open')
          dropdownBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
        })

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
          if (dropdownWrap && !dropdownWrap.contains(e.target)) {
            dropdownWrap.classList.remove('open')
            dropdownBtn.setAttribute('aria-expanded', 'false')
          }
        })

        // Close dropdown on Escape key
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && dropdownWrap.classList.contains('open')) {
            dropdownWrap.classList.remove('open')
            dropdownBtn.setAttribute('aria-expanded', 'false')
          }
        })

        // Close dropdown when any item inside is clicked
        dropdownMenu?.querySelectorAll('a, button').forEach(item => {
          item.addEventListener('click', () => {
            dropdownWrap.classList.remove('open')
            dropdownBtn.setAttribute('aria-expanded', 'false')
          })
        })
      }
      
      // Wire up dropdown navigation links for single-page tab switching
      desktopContainer.querySelectorAll('a[href*="user-dashboard.html"]').forEach(link => {
        link.addEventListener('click', (e) => {
          if (window.location.pathname.includes('user-dashboard')) {
            const url = new URL(link.href, window.location.origin)
            const targetHash = url.hash.replace('#', '') || 'overview'
            if (typeof window.setActiveDashboardTab === 'function') {
              e.preventDefault()
              window.location.hash = targetHash
              window.setActiveDashboardTab(targetHash)
              if (targetHash === 'profile') {
                setTimeout(() => {
                  document.getElementById('section-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 50)
              }
            }
          }
        })
      })

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
               <a href="${targetDashboardUrl}" class="text-xs text-accent-primary font-bold hover:underline flex items-center gap-1 mt-0.5">
                 <span>Vào ${isAdmin ? 'Bảng Quản Trị Admin' : 'Trang Của Tôi'} →</span>
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

    // Update Desktop Nav for logged-in user
    const desktopNav = document.getElementById('desktop-nav')
    if (desktopNav) {
      const oldTab = desktopNav.querySelector('a[href*="cua-toi"]') || desktopNav.querySelector('a[href*="user-dashboard"]') || desktopNav.querySelector('a[href*="admin-dashboard"]')
      if (oldTab) {
        oldTab.href = targetDashboardUrl
        oldTab.innerHTML = `<span>${targetDashboardLabel}</span>`
      } else {
        const isUserDashPage = window.location.pathname.includes('user-dashboard') || window.location.pathname.includes('admin-dashboard')
        const userTab = document.createElement('a')
        userTab.href = targetDashboardUrl
        userTab.className = isUserDashPage
          ? 'nav-link active font-bold text-accent-primary py-1 transition-colors flex items-center gap-1'
          : 'nav-link hover:text-text-primary py-1 transition-colors flex items-center gap-1'
        userTab.innerHTML = `<span>${targetDashboardLabel}</span>`
        
        const firstLink = desktopNav.firstElementChild
        if (firstLink && firstLink.nextElementSibling) {
          desktopNav.insertBefore(userTab, firstLink.nextElementSibling)
        } else {
          desktopNav.appendChild(userTab)
        }
      }
    }

    // Update Mobile Drawer Nav for logged-in user
    const mobileNav = document.querySelector('#mobile-menu-drawer nav')
    if (mobileNav) {
      const oldTabMobile = mobileNav.querySelector('a[href*="cua-toi"]') || mobileNav.querySelector('a[href*="user-dashboard"]') || mobileNav.querySelector('a[href*="admin-dashboard"]')
      if (oldTabMobile) {
        oldTabMobile.href = targetDashboardUrl
        oldTabMobile.innerHTML = `<span>${targetDashboardLabel}</span>`
      } else {
        const isUserDashPage = window.location.pathname.includes('user-dashboard') || window.location.pathname.includes('admin-dashboard')
        const userTabMobile = document.createElement('a')
        userTabMobile.href = targetDashboardUrl
        userTabMobile.className = isUserDashPage
          ? 'px-4 py-3 rounded-2xl bg-black/5 dark:bg-white/5 text-accent-primary font-bold transition-colors flex items-center gap-2'
          : 'px-4 py-3 rounded-2xl hover:bg-glass-bg-hover text-text-primary transition-colors flex items-center gap-2'
        userTabMobile.innerHTML = `<span>${targetDashboardLabel}</span>`

        const firstLink = mobileNav.firstElementChild
        if (firstLink && firstLink.nextElementSibling) {
          mobileNav.insertBefore(userTabMobile, firstLink.nextElementSibling)
        } else {
          mobileNav.appendChild(userTabMobile)
        }
      }
    }

    // Hide mobile hamburger button when logged in (tabs shown directly in rows 2 & 3)
    const mobileMenuBtn = document.getElementById('mobile-menu-btn')
    if (mobileMenuBtn) mobileMenuBtn.classList.add('hidden')

    // Show or create 3-row layout for mobile logged-in navigation (Row 2 & Row 3)
    let mobileLoggedInNav = document.getElementById('mobile-logged-in-nav')
    if (!mobileLoggedInNav) {
      const mainNavContainer = document.querySelector('#main-nav > div') || document.querySelector('header .container') || document.querySelector('header > div')
      if (mainNavContainer) {
        mobileLoggedInNav = document.createElement('div')
        mobileLoggedInNav.id = 'mobile-logged-in-nav'
        mobileLoggedInNav.className = 'md:hidden flex flex-col pt-1 mt-0.5 text-xs font-bold text-text-muted'
        mobileLoggedInNav.innerHTML = `
          <!-- Hàng 2: Trang chủ, Trang của tôi, Kho Video Tab -->
          <div class="grid grid-cols-3 text-center py-0.5 gap-1">
            <a href="/index.html" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors">Trang chủ</a>
            <a href="${targetDashboardUrl}" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors flex items-center gap-0.5">
              <span>${targetDashboardLabel}</span>
            </a>
            <a href="/kho-tab.html" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors">Kho Video Tab</a>
          </div>
          <!-- Hàng 3: Công Cụ, Hỏi đáp, Liên hệ -->
          <div class="grid grid-cols-3 text-center py-0.5 gap-1">
            <a href="/index.html#tools" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors">Công Cụ</a>
            <a href="#faq" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors">Hỏi đáp</a>
            <a href="#contact" class="nav-link py-1 text-[11px] sm:text-xs font-bold justify-center transition-colors">Liên hệ</a>
          </div>
        `
        mainNavContainer.appendChild(mobileLoggedInNav)
      }
    } else {
      const userTabInMobile = mobileLoggedInNav.querySelector('a[href*="dashboard"]')
      if (userTabInMobile) userTabInMobile.href = targetDashboardUrl
      mobileLoggedInNav.classList.remove('hidden')
      mobileLoggedInNav.classList.add('flex')
    }

    // Refresh active navigation link highlights after header update
    initNavActiveSpy()
  }
}

/**
 * Mobile Auto-Hide Header on Scroll Down & Reveal on Scroll Up
 */
export function initMobileHeaderScroll() {
  const mainNav = document.getElementById('main-nav')
  if (!mainNav) return

  let lastScrollY = window.scrollY
  let ticking = false

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        if (window.innerWidth < 768) {
          if (currentScrollY > lastScrollY && currentScrollY > 60) {
            // Scrolling down -> hide header
            mainNav.classList.add('-translate-y-full')
          } else if (currentScrollY < lastScrollY) {
            // Scrolling up -> show header
            mainNav.classList.remove('-translate-y-full')
          }
        } else {
          mainNav.classList.remove('-translate-y-full')
        }
        lastScrollY = Math.max(0, currentScrollY)
        ticking = false
      })
      ticking = true
    }
  }, { passive: true })
}

/**
 * Synchronizes and highlights the active navigation tab underline across all pages, hash links and sections.
 */
export function initNavActiveSpy() {
  const desktopNav = document.getElementById('desktop-nav')
  const mobileNav = document.querySelector('#mobile-menu-drawer nav')

  function getAllNavLinks() {
    const desktopLinks = desktopNav ? Array.from(desktopNav.querySelectorAll('a.nav-link')) : []
    const mobileHeaderLinks = Array.from(document.querySelectorAll('#mobile-logged-in-nav a.nav-link'))
    const mobileLinks = mobileNav ? Array.from(mobileNav.querySelectorAll('a')) : []
    return { desktopLinks: [...desktopLinks, ...mobileHeaderLinks], mobileLinks }
  }

  function getLinkKey(href) {
    if (!href) return ''
    if (href.includes('kho-tab')) return 'kho-tab'
    if (href.includes('user-dashboard') && !href.includes('#')) return 'dashboard'
    if (href.includes('#tools') || href.includes('cong-cu') || href.includes('metronome')) return 'tools'
    if (href.includes('#faq') || href.includes('faq')) return 'faq'
    if (href.includes('#contact') || href.includes('contact')) return 'contact'
    if (href.includes('index.html') || href === '/' || href.includes('#about') || href.includes('#hero')) return 'home'
    return ''
  }

  function setActiveKey(key) {
    if (!key) return
    const { desktopLinks, mobileLinks } = getAllNavLinks()

    desktopLinks.forEach(link => {
      const linkKey = getLinkKey(link.getAttribute('href'))
      if (linkKey === key) {
        link.classList.add('active', 'font-bold', 'text-accent-primary')
        link.classList.remove('text-text-muted')
      } else {
        link.classList.remove('active', 'font-bold', 'text-accent-primary')
        link.classList.add('text-text-muted')
      }
    })

    mobileLinks.forEach(link => {
      const linkKey = getLinkKey(link.getAttribute('href'))
      if (linkKey === key) {
        link.classList.add('text-accent-primary', 'font-bold')
        link.classList.remove('text-text-primary')
      } else {
        link.classList.remove('text-accent-primary', 'font-bold')
        link.classList.add('text-text-primary')
      }
    })
  }

  function getActiveSectionOnPage() {
    // Check if scrolled near bottom of page (for footer/contact)
    const isNearBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 150)
    if (isNearBottom) {
      const contactEl = document.getElementById('contact')
      if (contactEl) return 'contact'
    }

    const sections = [
      { id: 'contact', key: 'contact' },
      { id: 'faq', key: 'faq' },
      { id: 'tools', key: 'tools' },
      { id: 'gear', key: 'tools' },
      { id: 'featured', key: 'home' },
      { id: 'about', key: 'home' },
      { id: 'hero', key: 'home' }
    ]

    const scrollY = window.scrollY + 200

    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) {
        const top = el.offsetTop
        const height = el.offsetHeight
        if (scrollY >= top && scrollY < top + height) {
          return s.key
        }
      }
    }

    // Default base page key when near top
    const path = window.location.pathname
    if (path.includes('kho-tab')) return 'kho-tab'
    if (path.includes('user-dashboard')) return 'dashboard'
    if (path.includes('cong-cu') || path.includes('metronome')) return 'tools'
    return 'home'
  }

  function updateSpy() {
    setActiveKey(getActiveSectionOnPage())
  }

  window.addEventListener('scroll', updateSpy, { passive: true })
  window.addEventListener('resize', updateSpy, { passive: true })
  window.addEventListener('hashchange', () => {
    setTimeout(updateSpy, 50)
  })

  // Listen to clicks on nav links
  document.addEventListener('click', (e) => {
    const targetLink = e.target.closest('a')
    if (!targetLink) return
    const href = targetLink.getAttribute('href')
    if (!href) return

    if (targetLink.classList.contains('nav-link') || targetLink.closest('#desktop-nav') || targetLink.closest('#mobile-menu-drawer') || targetLink.closest('#mobile-logged-in-nav')) {
      const key = getLinkKey(href)
      if (key) {
        setActiveKey(key)
      }
    }
  })

  updateSpy()
}

/**
 * Universal Mobile Virtual Keyboard Auto-Scroll Helper
 * Keeps focused inputs visible above the mobile keyboard
 */
export function initMobileKeyboardScroll() {
  if (window._gbq_keyboard_scroll_initialized) return
  window._gbq_keyboard_scroll_initialized = true

  function scrollIntoVisibleArea(el) {
    if (!el || !(el instanceof HTMLElement)) return
    
    // Immediate gentle scroll
    setTimeout(() => {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      })
    }, 150)

    // Keyboard animation sync scroll (~300-400ms on iOS/Android)
    setTimeout(() => {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      })
    }, 350)
  }

  // Listen to focus on all inputs/textareas
  document.addEventListener('focusin', (e) => {
    const target = e.target
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
      scrollIntoVisibleArea(target)
    }
  }, { passive: true })

  // Handle virtual viewport resize when keyboard opens or closes
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        scrollIntoVisibleArea(active)
      }
    }, { passive: true })
  }
}

/**
 * Universal Password Toggle Helper (with Global Event Delegation)
 */
export function initPasswordToggles() {
  if (window._gbq_password_toggles_initialized) return
  window._gbq_password_toggles_initialized = true

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-password]')
    if (!btn) return

    e.preventDefault()
    e.stopPropagation()

    const targetId = btn.getAttribute('data-toggle-password')
    const input = (targetId ? document.getElementById(targetId) : null) || btn.parentElement?.querySelector('input')
    if (!input) return

    const isPassword = input.type === 'password'
    input.type = isPassword ? 'text' : 'password'

    const eyeOpen = btn.querySelector('.eye-open')
    const eyeClosed = btn.querySelector('.eye-closed')

    if (eyeOpen && eyeClosed) {
      eyeOpen.classList.toggle('hidden', isPassword)
      eyeClosed.classList.toggle('hidden', !isPassword)
    }

    const label = isPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
    btn.setAttribute('aria-label', label)
    btn.setAttribute('title', label)
  })
}

document.addEventListener("DOMContentLoaded", () => {
  initAuthHeader()
  initNavActiveSpy()
  initMobileHeaderScroll()
  initPasswordToggles()
  initMobileKeyboardScroll()
})
initNavActiveSpy()
initMobileHeaderScroll()
initPasswordToggles()
initMobileKeyboardScroll()

