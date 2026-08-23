/**
 * Shared utility functions across all pages
 */

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
