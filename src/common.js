import { supabase } from './lib/supabase.js'
import { withReturnTo } from './lib/navigate.js'
import { initKeyboardReveal } from './lib/keyboard-reveal.js'
import { iconBolt, iconPerson, iconLogout, iconCrown } from './icons.js'

// profiles.full_name/avatar_url do chính người dùng tự đặt (qua form Hồ Sơ) —
// phải escape trước khi chèn vào innerHTML, nếu không ai cũng có thể đặt tên
// dạng "<img src=x onerror=...>" để tự chạy JS ngay trong menu tài khoản của
// chính họ (và của bất kỳ ai vô tình xem trang có hiển thị tên đó).
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

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
    const isAdmin =
      pathname.includes('admin') || hash.includes('role=admin') || search.includes('role=admin')
    const targetUrl = isAdmin ? '/admin-reset-password.html' : '/reset-password.html'
    window.location.replace(`${targetUrl}${hash || search}`)
    return
  }

  // Also listen for Supabase PASSWORD_RECOVERY auth event
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' && !window.location.pathname.includes('reset-password')) {
      const isAdmin =
        window.location.pathname.includes('admin') || window.location.hash.includes('admin')
      const targetUrl = isAdmin ? '/admin-reset-password.html' : '/reset-password.html'
      window.location.replace(`${targetUrl}${window.location.hash}`)
    }
  })
})()

/**
 * Initializes the sticky glass navbar shrink effect on scroll.
 */
export function initNavbarShrink() {
  const navbar = document.getElementById('main-nav')
  if (!navbar) return

  let ticking = false
  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        if (window.scrollY > 60) {
          navbar.classList.add('nav-shrunk', 'shadow-lg', 'border-b', 'border-glass-border')
          navbar.style.backgroundColor = 'var(--header-bg)'
        } else {
          navbar.classList.remove('nav-shrunk', 'shadow-lg')
          navbar.classList.add('border-b', 'border-glass-border')
          navbar.style.backgroundColor = ''
        }
        ticking = false
      })
      ticking = true
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true })
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

  // Đóng nhanh hơn mở (~65% thời lượng) để cảm giác phản hồi nhanh nhạy hơn —
  // trước đây cả 2 chiều đều dùng chung duration-300 của Tailwind. Set thẳng
  // transitionDuration ở đây (ghi đè class duration-300 trong HTML) để không
  // phải sửa lặp lại ở cả 5 trang dùng chung khối drawer này.
  const OPEN_MS = 300
  const CLOSE_MS = 200

  const openMenu = () => {
    menuDrawer.style.transitionDuration = `${OPEN_MS}ms`
    menuDrawer.classList.remove('translate-x-full', 'pointer-events-none')
    menuDrawer.classList.add('pointer-events-auto')
    if (backdrop) {
      backdrop.style.transitionDuration = `${OPEN_MS}ms`
      backdrop.classList.remove('hidden')
      requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0')
      })
    }
    document.body.style.overflow = 'hidden'
  }

  const closeMenu = () => {
    menuDrawer.style.transitionDuration = `${CLOSE_MS}ms`
    menuDrawer.classList.add('translate-x-full', 'pointer-events-none')
    menuDrawer.classList.remove('pointer-events-auto')
    if (backdrop) {
      backdrop.style.transitionDuration = `${CLOSE_MS}ms`
      backdrop.classList.add('opacity-0')
    }
    setTimeout(() => {
      if (backdrop) backdrop.classList.add('hidden')
    }, CLOSE_MS)
    document.body.style.overflow = ''
  }

  toggleBtn.addEventListener('click', openMenu)
  if (closeBtn) closeBtn.addEventListener('click', closeMenu)
  if (backdrop) backdrop.addEventListener('click', closeMenu)

  // Close when clicking any nav link inside mobile menu
  menuDrawer.querySelectorAll('a').forEach((link) => {
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
 * Mirrors the :hover lift/shine effect on .song-card/.gear-card/.card-interactive
 * to touch devices, which never fire :hover. Adds `.touch-active` on touchstart
 * (matched by the same CSS rules as :hover) and removes it shortly after release
 * so the feedback is visible instead of invisible-and-instant.
 */
export function initCardTouchFeedback() {
  const selector = '.song-card, .gear-card, .card-interactive'
  let activeEl = null

  document.addEventListener(
    'touchstart',
    (e) => {
      const card = e.target.closest(selector)
      if (!card) return
      activeEl = card
      card.classList.add('touch-active')
    },
    { passive: true }
  )

  const release = () => {
    if (!activeEl) return
    const el = activeEl
    activeEl = null
    setTimeout(() => el.classList.remove('touch-active'), 200)
  }

  document.addEventListener('touchend', release, { passive: true })
  document.addEventListener('touchcancel', release, { passive: true })
}

/**
 * Checks authentication state and updates the header if user is logged in
 */
/** Điền số "Tab đã mua" / "Yêu thích" vào menu tài khoản (RLS: chỉ đọc được dòng của chính mình). */
async function loadUserCounts(menu, userId) {
  const count = (table) =>
    supabase.from(table).select('song_id', { count: 'exact', head: true }).eq('user_id', userId)
  try {
    const [p, f] = await Promise.all([count('purchases'), count('favorites')])
    const set = (key, res) => {
      const el = menu.querySelector(`[data-user-count="${key}"]`)
      if (el) el.textContent = res.error || res.count == null ? '–' : String(res.count)
    }
    set('purchases', p)
    set('favorites', f)
  } catch (e) {
    console.warn('Không lấy được số bài cho menu tài khoản:', e)
  }
}

export async function initAuthHeader() {
  const desktopContainer = document.getElementById('desktop-auth-container')
  const mobileContainer = document.getElementById('mobile-auth-container')

  if (!desktopContainer && !mobileContainer) return

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

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

    // profiles.full_name/avatar_url và user.email đều có thể do người dùng tự
    // đặt — escape trước khi chèn vào innerHTML để chặn XSS (xem escapeHtml).
    const safeFullName = escapeHtml(fullName)
    const safeAvatarUrl = escapeHtml(avatarUrl)
    const safeEmail = escapeHtml(user.email || '')
    const initial = escapeHtml(fullName.charAt(0).toUpperCase())

    // Avatar image or initial letter
    const avatarHtml = avatarUrl
      ? `<img src="${safeAvatarUrl}" alt="${safeFullName}" class="w-6 h-6 rounded-full object-cover border border-amber-400/50" />`
      : `<div class="w-6 h-6 rounded-full bg-warm-gradient text-white flex items-center justify-center text-xs font-bold shadow-xs">${initial}</div>`

    const mobileAvatarHtml = avatarUrl
      ? `<img src="${safeAvatarUrl}" alt="${safeFullName}" class="w-10 h-10 rounded-full object-cover border-2 border-amber-400/60 shadow-sm" />`
      : `<div class="w-10 h-10 rounded-full bg-warm-gradient text-white flex items-center justify-center text-lg font-bold shadow-sm">${initial}</div>`

    const isAdmin = role === 'admin'

    // targetDashboardUrl = "công cụ chính" của tài khoản (nav tab, link nhanh
    // ở mobile) — admin thì đây là Bảng Quản Trị, thành viên thì là trang cá
    // nhân. Trong dropdown thì "Trang của tôi" luôn trỏ tới user-dashboard.html
    // (personalDashboardUrl) vì đó là trang hồ sơ/yêu thích/đã mua của CHÍNH
    // tài khoản đó — kể cả tài khoản admin cũng có thể có yêu thích/đã mua
    // riêng, và tránh trùng lặp với mục "⚡ Bảng Quản Trị Admin" ở trên.
    const targetDashboardUrl = isAdmin ? '/admin-dashboard.html' : '/user-dashboard.html'
    const targetDashboardLabel = isAdmin ? 'Bảng Quản Trị Admin' : 'Trang của tôi'
    const personalDashboardUrl = '/user-dashboard.html'

    const roleBadgeHtml = isAdmin
      ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 text-[10px] font-bold border border-purple-500/30">${iconCrown('w-2.5 h-2.5')}Admin</span>`
      : ''

    const bigAvatarHtml = avatarUrl
      ? `<img src="${safeAvatarUrl}" alt="" class="w-10 h-10 rounded-full object-cover flex-shrink-0" />`
      : `<span class="w-10 h-10 rounded-full bg-warm-gradient text-white grid place-items-center text-base font-bold flex-shrink-0">${initial}</span>`

    const menuItem = (href, icon, label, extra = '') =>
      `<a href="${href}" role="menuitem" ${extra} class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-text-primary hover:bg-glass-bg-hover hover:text-accent-primary focus-visible:bg-glass-bg-hover outline-none transition-colors">
          <span class="w-4 h-4 text-text-muted flex-shrink-0">${icon}</span><span>${label}</span></a>`

    const ICON_ZALO = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 18.5 6 15a7.5 7.5 0 1 1 3 2.5z"/></svg>'
    const ICON_HELP = '<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/></svg>'

    // Menu tài khoản: thẻ tên (vào trang cá nhân) · 2 ô số liệu bấm được · các lối
    // tắt khách hay cần (hồ sơ, nhắn Zalo hỗ trợ, hỏi đáp) · đăng xuất.
    // Lớp ngoài có pt-2 làm "cầu nối" vô hình giữa nút và menu: rê chuột từ nút
    // xuống không bị rơi vào khe hở làm menu tắt.
    const userDropdownHtml = `
      <div class="relative" id="user-header-dropdown-wrap">
        <button id="user-header-dropdown-btn" type="button" aria-expanded="false" aria-haspopup="menu" aria-controls="user-header-dropdown-menu" aria-label="Tài khoản của ${safeFullName}" class="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 sm:pr-3 rounded-full bg-glass-bg border border-glass-border hover:border-accent-primary/50 shadow-sm transition-colors cursor-pointer">
          ${avatarHtml}
          <span class="text-sm font-bold text-text-primary hidden sm:inline-block truncate max-w-[110px]">${safeFullName}</span>
          <span class="hidden md:inline-flex">${roleBadgeHtml}</span>
          <svg id="user-header-dropdown-arrow" class="w-3.5 h-3.5 text-text-muted transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        <div id="user-header-dropdown-menu" role="menu" aria-label="Tài khoản" class="user-menu absolute right-0 top-full pt-2 w-[18rem] max-w-[calc(100vw-1.5rem)] z-50">
          <div class="rounded-2xl bg-glass-bg border border-glass-border shadow-2xl p-2">
            <a href="${personalDashboardUrl}" role="menuitem" class="flex items-center gap-3 p-2.5 rounded-xl hover:bg-glass-bg-hover focus-visible:bg-glass-bg-hover outline-none transition-colors group/me">
              ${bigAvatarHtml}
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-text-primary truncate">${safeFullName}</span>
                <span class="block text-xs text-text-muted truncate">${safeEmail}</span>
              </span>
              <svg class="w-4 h-4 text-text-muted group-hover/me:text-accent-primary group-hover/me:translate-x-0.5 transition" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
            </a>
            <div class="grid grid-cols-2 gap-1.5 px-1 pt-1 pb-2">
              <a href="/user-dashboard.html#purchases" role="menuitem" class="rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover focus-visible:bg-glass-bg-hover outline-none px-3 py-2 transition-colors">
                <span class="block text-lg font-extrabold tabular-nums text-text-primary" data-user-count="purchases">–</span>
                <span class="block text-[11px] font-semibold text-text-muted">Tab đã mua</span>
              </a>
              <a href="/user-dashboard.html#favorites" role="menuitem" class="rounded-xl bg-black/5 dark:bg-white/5 hover:bg-glass-bg-hover focus-visible:bg-glass-bg-hover outline-none px-3 py-2 transition-colors">
                <span class="block text-lg font-extrabold tabular-nums text-text-primary" data-user-count="favorites">–</span>
                <span class="block text-[11px] font-semibold text-text-muted">Yêu thích</span>
              </a>
            </div>
            <div class="border-t border-glass-border pt-1">
              ${isAdmin ? menuItem('/admin-dashboard.html', iconBolt('w-4 h-4'), 'Bảng quản trị') : ''}
              ${menuItem('/user-dashboard.html#profile', iconPerson('w-4 h-4'), 'Hồ sơ & mật khẩu')}
              ${menuItem('https://zalo.me/0326768885', ICON_ZALO, 'Nhắn Zalo hỗ trợ', 'target="_blank" rel="noopener"')}
              ${menuItem('/index.html#faq', ICON_HELP, 'Câu hỏi thường gặp')}
            </div>
            <div class="border-t border-glass-border mt-1 pt-1">
              <button id="auth-logout-btn" type="button" role="menuitem" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 focus-visible:bg-rose-500/10 outline-none transition-colors cursor-pointer">
                <span class="w-4 h-4 flex-shrink-0">${iconLogout('w-4 h-4')}</span><span>Đăng xuất</span>
              </button>
            </div>
          </div>
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
        // Máy tính (có chuột): rê vào là mở, rời ra đóng sau một nhịp ngắn. Điện
        // thoại: bấm để mở/đóng. Trước đây vừa hover (CSS) vừa click (JS) chồng
        // nhau nên bấm lúc đang rê chuột trông như không có tác dụng.
        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches
        const items = () => [...dropdownMenu.querySelectorAll('[role="menuitem"]')]
        let closeTimer = null
        const setOpen = (open) => {
          clearTimeout(closeTimer)
          if (dropdownWrap.classList.contains('open') === open) return
          dropdownWrap.classList.toggle('open', open)
          dropdownBtn.setAttribute('aria-expanded', String(open))
          if (open) loadUserCounts(dropdownMenu, user.id)
        }

        dropdownBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          setOpen(canHover ? true : !dropdownWrap.classList.contains('open'))
        })
        if (canHover) {
          dropdownWrap.addEventListener('mouseenter', () => setOpen(true))
          dropdownWrap.addEventListener('mouseleave', () => {
            closeTimer = setTimeout(() => setOpen(false), 200)
          })
        }

        document.addEventListener('click', (e) => {
          if (!dropdownWrap.contains(e.target)) setOpen(false)
        })

        dropdownWrap.addEventListener('keydown', (e) => {
          const list = items()
          const idx = list.indexOf(document.activeElement)
          if (e.key === 'Escape') {
            setOpen(false)
            dropdownBtn.focus()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            list[(idx + 1) % list.length]?.focus()
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            list[(idx - 1 + list.length) % list.length]?.focus()
          }
        })
        dropdownWrap.addEventListener('focusout', (e) => {
          if (!dropdownWrap.contains(e.relatedTarget)) setOpen(false)
        })

        items().forEach((item) => item.addEventListener('click', () => setOpen(false)))
      }

      // Wire up dropdown navigation links for single-page tab switching
      desktopContainer.querySelectorAll('a[href*="user-dashboard.html"]').forEach((link) => {
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
                  document
                    .getElementById('section-profile')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
                 <p class="text-sm font-bold text-text-primary">${safeFullName}</p>
               </div>
               <a href="${targetDashboardUrl}" class="text-xs text-accent-primary font-bold hover:underline flex items-center gap-1 mt-0.5">
                 <span>Vào ${isAdmin ? 'Bảng Quản Trị Admin' : 'Trang của tôi'} →</span>
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

    // Update Mobile Drawer Nav for logged-in user
    const mobileNav = document.querySelector('#mobile-menu-drawer nav')
    if (mobileNav) {
      const oldTabMobile =
        mobileNav.querySelector('a[href*="user-dashboard"]') ||
        mobileNav.querySelector('a[href*="admin-dashboard"]')
      if (oldTabMobile) {
        oldTabMobile.href = targetDashboardUrl
        oldTabMobile.innerHTML = `<span>${targetDashboardLabel}</span>`
      } else {
        const isUserDashPage =
          window.location.pathname.includes('user-dashboard') ||
          window.location.pathname.includes('admin-dashboard')
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

    document.querySelectorAll('#desktop-nav [data-member-only]').forEach((a) => a.classList.add('is-member'))
    updateBottomNavAccount({
      href: targetDashboardUrl,
      label: isAdmin ? 'Quản trị' : 'Của tôi',
      avatarHtml: avatarHtml,
    })

    // Refresh active navigation link highlights after header update
    initNavActiveSpy()
  }
}

/**
 * Fix: khi đăng nhập trên mobile, header chèn thêm 2 hàng menu
 * (#mobile-logged-in-nav — xem updateHeaderForUser ở trên) khiến header cao
 * hơn mức padding-top cố định (pt-28...) mà mỗi trang đã đặt sẵn cho nội
 * dung bên dưới, làm phần đầu trang (badge/tiêu đề hero...) bị che mất.
 * Hàm này bù thêm đúng phần chiều cao dư ra đó vào padding-top của <main>,
 * chỉ khi hàng menu đó thực sự xuất hiện — không ảnh hưởng gì tới layout
 * bình thường lúc chưa đăng nhập.
 */
export function initHeaderOverlapFix() {
  const main = document.querySelector('main')
  const header = document.getElementById('main-nav')
  if (!main || !header) return

  const apply = () => {
    const extraNav = document.getElementById('mobile-logged-in-nav')
    const isShown =
      extraNav && window.innerWidth < 768 && getComputedStyle(extraNav).display !== 'none'

    if (!isShown) {
      main.style.paddingTop = ''
      return
    }

    // Đo lại padding-top gốc (từ class pt-28/pt-32 của Tailwind) mỗi lần áp
    // dụng thay vì đo 1 lần lúc khởi tạo — trước đây set thẳng
    // main.style.paddingTop = extra khiến nó GHI ĐÈ hoàn toàn padding gốc
    // thay vì cộng thêm vào, làm nội dung đầu trang (badge/tiêu đề hero) bị
    // header 2 hàng che mất trên mọi trang có sẵn pt-28/pt-32 (kho-tab.html,
    // user-dashboard.html...). Phải tạm xoá inline style trước khi đo để lấy
    // đúng giá trị base đang áp dụng theo breakpoint hiện tại.
    main.style.paddingTop = ''
    const basePaddingTop = parseFloat(getComputedStyle(main).paddingTop) || 0
    const extra = extraNav.getBoundingClientRect().height
    main.style.paddingTop = `${basePaddingTop + extra}px`
  }

  apply()
  window.addEventListener('resize', apply)

  // #mobile-logged-in-nav được chèn bất đồng bộ sau khi kiểm tra đăng nhập
  // xong (initAuthHeader), nên phải theo dõi thay đổi DOM của header thay vì
  // gọi apply() một lần lúc tải trang.
  const observer = new MutationObserver(apply)
  observer.observe(header, { childList: true, subtree: true, attributes: true })
}

/**
 * Mobile Auto-Hide Header on Scroll Down & Reveal on Scroll Up
 */
export function initMobileHeaderScroll() {
  const mainNav = document.getElementById('main-nav')
  if (!mainNav) return

  // Reappearing on ANY upward scroll (regardless of position) made the header
  // slide back over content sitting just below the fold — e.g. the hero badge
  // on index.html, still only ~60-100px down when scrolling back up a little.
  // Only hide/reveal past this point so it can never land on top of that.
  //
  // Ngưỡng này trước đây lấy theo chiều cao khối #hero (chỉ index.html có,
  // ~1179px — phải lướt qua gần hết cả khối giới thiệu mới ẩn) rồi lại đổi
  // sang window.innerHeight (~1 màn hình, vẫn quá sâu). Theo phản hồi thực tế
  // trên điện thoại: chỉ cần lướt qua khỏi badge tới ngang tiêu đề giới thiệu
  // (~150-200px) là đã đủ để ẩn — dùng một hằng số nhỏ, cố định cho MỌI trang
  // thay vì phụ thuộc chiều cao nội dung của từng trang, vừa nhất quán vừa
  // đúng cảm giác "lướt một chút là ẩn" mà vẫn nằm ngoài vùng ~60-100px sát
  // đầu trang gây ra lỗi che nội dung nói trên.
  const revealThreshold = 200

  let lastScrollY = window.scrollY
  let ticking = false

  window.addEventListener(
    'scroll',
    () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY
          if (window.innerWidth < 768 && currentScrollY > revealThreshold) {
            if (currentScrollY > lastScrollY) {
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
    },
    { passive: true }
  )
}

/**
 * Synchronizes and highlights the active navigation tab underline across all pages, hash links and sections.
 */
/** Khoá của trang đang mở — dùng chung cho menu máy tính và thanh dưới đáy. */
function currentPageKey() {
  const p = window.location.pathname
  if (p.includes('kho-tab')) return 'kho-tab'
  if (p.includes('cong-cu') || p.includes('metronome')) return 'tools'
  if (p.includes('luyen-cam-am')) return 'game'
  if (p.includes('user-dashboard') || p.includes('admin-dashboard')) return 'account'
  if (p === '/' || p.endsWith('/index.html')) return 'home'
  return ''
}

function getLinkKey(href) {
  if (!href) return ''
  if (href.includes('kho-tab')) return 'kho-tab'
  if (href.includes('#tools') || href.includes('cong-cu') || href.includes('metronome'))
    return 'tools'
  if (href.includes('luyen-cam-am')) return 'game'
  if (href.includes('dashboard') && !href.includes('#')) return 'account'
  if (href === '/' || href === '/index.html') return 'home'
  return ''
}

/**
 * Đánh dấu mục menu của trang hiện tại. Trước đây đổi theo vị trí cuộn (cuộn
 * tới FAQ thì "Hỏi đáp" sáng) nên đang ở Trang của tôi mà lại gạch chân mục
 * khác — người xem không biết mình đang ở đâu. Giờ chỉ theo trang.
 */
export function initNavActiveSpy() {
  const key = currentPageKey()
  document.querySelectorAll('#desktop-nav a.nav-link').forEach((link) => {
    const on = key !== '' && getLinkKey(link.getAttribute('href')) === key
    link.classList.toggle('active', on)
    if (on) link.setAttribute('aria-current', 'page')
    else link.removeAttribute('aria-current')
  })
  document.querySelectorAll('#mobile-menu-drawer nav a').forEach((link) => {
    const on = key !== '' && getLinkKey(link.getAttribute('href')) === key
    link.classList.toggle('text-accent-primary', on)
    link.classList.toggle('font-bold', on)
    link.classList.toggle('text-text-primary', !on)
  })
}

// ==========================================================================
// THANH ĐIỀU HƯỚNG DƯỚI ĐÁY (điện thoại) — kiểu "kính trong" nổi như app
// ==========================================================================
// Dựng bằng JS ở MỘT chỗ cho mọi trang có header công khai (#desktop-nav), để
// không phải chép tay 5 lần. Kiểu dáng ở .bottom-nav trong style.css.
const NAV_ICON = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const BOTTOM_NAV_ITEMS = [
  {
    key: 'home',
    href: '/index.html',
    label: 'Trang chủ',
    icon: NAV_ICON('<path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z"/>'),
  },
  {
    key: 'kho-tab',
    href: '/kho-tab.html',
    label: 'Kho tab',
    icon: NAV_ICON('<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
  },
  {
    key: 'tools',
    href: '/cong-cu.html',
    label: 'Công cụ',
    icon: NAV_ICON('<path d="M9.5 3.5h5l3.5 17h-12z"/><path d="M12 16.5 15.5 6"/><path d="M8.2 14h7.6"/>'),
  },
  {
    key: 'game',
    href: '/luyen-cam-am.html',
    label: 'Cảm âm',
    icon: NAV_ICON('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="2"/><rect x="16.5" y="14" width="4.5" height="7" rx="2"/>'),
  },
  {
    key: 'account',
    href: '/login.html',
    label: 'Tài khoản',
    icon: NAV_ICON('<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  },
]

export function initBottomNav() {
  if (document.getElementById('bottom-nav') || !document.getElementById('desktop-nav')) return
  const key = currentPageKey()
  const activeIdx = BOTTOM_NAV_ITEMS.findIndex((i) => i.key === key)

  const nav = document.createElement('nav')
  nav.id = 'bottom-nav'
  nav.className = 'bottom-nav' + (activeIdx >= 0 ? ' has-active' : '')
  nav.setAttribute('aria-label', 'Điều hướng')
  nav.style.setProperty('--active', String(Math.max(activeIdx, 0)))
  nav.innerHTML =
    '<span class="bottom-nav__glow" aria-hidden="true"></span>' +
    BOTTOM_NAV_ITEMS.map(
      (item, i) => `
      <a href="${item.href}" class="bottom-nav__item" data-i="${i}" data-key="${item.key}"${i === activeIdx ? ' aria-current="page"' : ''}>
        <span class="bottom-nav__icon">${item.icon}</span>
        <span class="bottom-nav__label">${item.label}</span>
      </a>`
    ).join('')
  document.body.appendChild(nav)
  document.body.classList.add('has-bottom-nav')
  const accountItem = nav.querySelector('[data-key="account"]')
  if (accountItem) accountItem.href = withReturnTo('/login.html')

  // Nhấn mục khác: "giọt kính" trượt sang ngay, trong lúc trang mới đang tải.
  nav.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-i]')
    if (!link) return
    nav.style.setProperty('--active', link.dataset.i)
    nav.classList.add('has-active')
  })

  // Bàn phím ảo đang mở: ẩn thanh để không đè lên ô đang nhập.
  const isField = (el) => el?.matches?.('input, textarea, select, [contenteditable="true"]')
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) nav.classList.add('is-hidden')
  })
  document.addEventListener('focusout', (e) => {
    if (isField(e.target)) nav.classList.remove('is-hidden')
  })
}

/** Đã đăng nhập: mục cuối thành "Của tôi" kèm ảnh đại diện nhỏ. */
function updateBottomNavAccount({ href, label, avatarHtml }) {
  const item = document.querySelector('#bottom-nav [data-key="account"]')
  if (!item) return
  item.href = href
  item.querySelector('.bottom-nav__label').textContent = label
  item.querySelector('.bottom-nav__icon').innerHTML = avatarHtml
  item.classList.add('has-avatar')
}

/**
 * Universal Mobile Virtual Keyboard Auto-Scroll Helper
 * Keeps focused inputs visible above the mobile keyboard
 */
export function initMobileKeyboardScroll() {
  // Logic ở src/lib/keyboard-reveal.js (đo vùng trên bàn phím bằng visualViewport,
  // chừa chỗ cuộn cho trang ngắn, cuộn cả hộp thoại cố định) — có test riêng.
  initKeyboardReveal()
}

/**
 * Wires up the generic "quên mật khẩu" modal dùng chung giữa login.js và
 * admin-login.js (trước đây 2 file gần như copy-paste y hệt nhau ~70 dòng).
 * LUÔN hiện `successMessage` bất kể resetPasswordForEmail thành công hay lỗi
 * — bắt buộc để chống user enumeration (CWE-204), xem tài liệu dự án.
 */
export function initForgotPasswordModal({
  prefillEmailInputId,
  redirectPath,
  successMessage,
  emptyEmailMessage,
  logPrefix,
}) {
  const openBtn = document.getElementById('open-forgot-modal-btn')
  const closeBtn = document.getElementById('close-forgot-modal-btn')
  const cancelBtn = document.getElementById('cancel-forgot-btn')
  const modal = document.getElementById('forgot-password-modal')
  const form = document.getElementById('forgot-form')
  const emailInput = document.getElementById('forgot-email')
  const submitBtn = document.getElementById('forgot-submit-btn')
  const btnText = document.getElementById('forgot-btn-text')
  const btnSpinner = document.getElementById('forgot-btn-spinner')
  const alertBox = document.getElementById('forgot-alert')
  const alertText = document.getElementById('forgot-alert-text')
  const alertIcon = document.getElementById('forgot-alert-icon')
  const prefillInput = prefillEmailInputId ? document.getElementById(prefillEmailInputId) : null

  function showAlert(message, isSuccess = false) {
    if (!alertBox || !alertText) return
    alertBox.classList.remove('hidden')
    alertText.textContent = message

    if (isSuccess) {
      alertBox.className =
        'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      alertBox.className =
        'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add('hidden')
  }

  function setLoading(isLoading) {
    if (!submitBtn) return
    submitBtn.disabled = isLoading
    if (isLoading) {
      submitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = 'Đang gửi email...'
      if (btnSpinner) btnSpinner.classList.remove('hidden')
    } else {
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = 'Gửi liên kết khôi phục'
      if (btnSpinner) btnSpinner.classList.add('hidden')
    }
  }

  function openModal() {
    if (!modal) return
    hideAlert()
    if (prefillInput && emailInput && prefillInput.value.trim()) {
      emailInput.value = prefillInput.value.trim()
    }
    modal.classList.remove('hidden')
  }

  function closeModal() {
    if (!modal) return
    modal.classList.add('hidden')
    hideAlert()
  }

  if (openBtn) openBtn.addEventListener('click', openModal)
  if (closeBtn) closeBtn.addEventListener('click', closeModal)
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal)

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal()
    })
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideAlert()

      const email = emailInput?.value?.trim()
      if (!email) {
        return showAlert(emptyEmailMessage)
      }

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      if (!emailRegex.test(email)) {
        return showAlert(
          'Gửi thất bại: Địa chỉ email không đúng định dạng hoặc sai tên email. Vui lòng kiểm tra lại.'
        )
      }

      setLoading(true)

      try {
        // KHÔNG kiểm tra email có tồn tại/có quyền admin hay không trước khi
        // gửi — tránh lộ thông tin (user enumeration). Luôn trả về
        // successMessage bất kể email có tồn tại trong hệ thống hay không.
        await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${redirectPath}`,
        })

        showAlert(successMessage, true)
        if (emailInput) emailInput.value = ''
      } catch (err) {
        console.error(`${logPrefix} Reset password error:`, err)
        showAlert(successMessage, true)
      } finally {
        setLoading(false)
      }
    })
  }
}

/**
 * Wires up form "đặt mật khẩu mới" dùng chung giữa reset-password.js (member)
 * và admin-reset-password.js (admin) — 2 file trước đây gần như copy-paste
 * y hệt nhau (~90%, chỉ khác id form, text nút, message thành công và trang
 * redirect). Element id (input mật khẩu, alert box, nút submit, account
 * email span...) giống hệt nhau giữa 2 trang nên không cần tham số hoá.
 */
/** Gợi ý độ mạnh mật khẩu hiện ở nhãn/placeholder các ô nhập mật khẩu — phải
 *  khớp đúng với cấu hình đã bật ở Supabase Auth (Authentication > Providers
 *  > Email > Password Requirements: tối thiểu 8 ký tự, gồm chữ hoa, chữ
 *  thường và số), nếu không đồng bộ thì Supabase sẽ từ chối dù đã qua hết
 *  kiểm tra phía client. */
export const PASSWORD_HINT_TEXT = 'Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số'

/** Kiểm tra mật khẩu trước ở phía client theo đúng yêu cầu đã bật ở Supabase
 *  Auth — trả về null nếu đạt, hoặc câu thông báo lỗi cụ thể đầu tiên chưa
 *  đạt để hiện ngay, không phải đợi submit xong mới bị Supabase từ chối. */
export function getPasswordWeaknessReason(password) {
  if (!password || password.length < 8) return 'Mật khẩu phải có tối thiểu 8 ký tự.'
  if (!/[a-z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ thường.'
  if (!/[A-Z]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ hoa.'
  if (!/[0-9]/.test(password)) return 'Mật khẩu phải có ít nhất 1 chữ số.'
  return null
}

/** Hiện trạng thái khớp/không khớp giữa ô mật khẩu và ô xác nhận NGAY lúc
 *  đang gõ (không đợi bấm submit mới biết) — dùng chung cho mọi form có cặp
 *  mật khẩu + xác nhận mật khẩu (đăng ký, đổi mật khẩu, đặt lại mật khẩu). */
export function initPasswordMatchHint({ passwordInputId, confirmInputId, hintElId }) {
  const passwordInput = document.getElementById(passwordInputId)
  const confirmInput = document.getElementById(confirmInputId)
  const hintEl = document.getElementById(hintElId)
  if (!passwordInput || !confirmInput || !hintEl) return

  function update() {
    if (!confirmInput.value) {
      hintEl.textContent = ''
      hintEl.classList.remove('text-emerald-500', 'text-rose-500')
      return
    }
    const matches = passwordInput.value === confirmInput.value
    hintEl.textContent = matches ? '✓ Mật khẩu khớp' : '✗ Mật khẩu chưa khớp'
    hintEl.classList.toggle('text-emerald-500', matches)
    hintEl.classList.toggle('text-rose-500', !matches)
  }

  passwordInput.addEventListener('input', update)
  confirmInput.addEventListener('input', update)
}

export function initPasswordResetForm({
  formId,
  defaultAccountLabel,
  loadingButtonText,
  idleButtonText,
  successMessage,
  redirectPath,
  logPrefix,
}) {
  const form = document.getElementById(formId)
  const newPasswordInput = document.getElementById('new-password')
  const confirmPasswordInput = document.getElementById('confirm-password')
  const submitBtn = document.getElementById('reset-submit-btn')
  const btnText = document.getElementById('btn-text')
  const btnSpinner = document.getElementById('btn-spinner')

  const alertBox = document.getElementById('reset-alert')
  const alertText = document.getElementById('reset-alert-text')
  const alertIcon = document.getElementById('reset-alert-icon')

  const accountEmailSpan = document.getElementById('account-email')

  initPasswordMatchHint({
    passwordInputId: 'new-password',
    confirmInputId: 'confirm-password',
    hintElId: 'password-match-hint',
  })

  function setAccountEmail(email) {
    if (accountEmailSpan) {
      accountEmailSpan.textContent = email || defaultAccountLabel
    }
  }

  function showAlert(message, isSuccess = false) {
    if (!alertBox || !alertText) return
    alertBox.classList.remove('hidden')
    alertText.textContent = message

    if (isSuccess) {
      alertBox.className =
        'p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
        alertIcon.classList.replace('text-rose-500', 'text-emerald-500')
      }
    } else {
      alertBox.className =
        'p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed flex items-center gap-2.5'
      if (alertIcon) {
        alertIcon.innerHTML =
          '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
        alertIcon.classList.replace('text-emerald-500', 'text-rose-500')
      }
    }
  }

  function hideAlert() {
    if (alertBox) alertBox.classList.add('hidden')
  }

  function setLoading(isLoading) {
    if (!submitBtn) return
    submitBtn.disabled = isLoading
    if (isLoading) {
      submitBtn.classList.add('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = loadingButtonText
      if (btnSpinner) btnSpinner.classList.remove('hidden')
    } else {
      submitBtn.classList.remove('opacity-70', 'cursor-not-allowed')
      if (btnText) btnText.textContent = idleButtonText
      if (btnSpinner) btnSpinner.classList.add('hidden')
    }
  }

  // Check URL hash / search params for Supabase error messages
  const hashParams = new URLSearchParams(window.location.hash.substring(1))
  const searchParams = new URLSearchParams(window.location.search)
  const errorDescription =
    hashParams.get('error_description') || searchParams.get('error_description')

  if (errorDescription) {
    showAlert(
      `Liên kết không hợp lệ hoặc đã hết hạn: ${decodeURIComponent(errorDescription.replace(/\+/g, ' '))}`
    )
    setLoading(true)
    if (submitBtn) submitBtn.style.display = 'none'
    if (accountEmailSpan) accountEmailSpan.textContent = 'Không hợp lệ'
    return
  }

  // Listen for Supabase Password Recovery event
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY' || session?.user) {
      if (session?.user?.email) {
        setAccountEmail(session.user.email)
      }
    }
  })

  // Verify if session exists
  async function checkSession() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session?.user?.email) {
        setAccountEmail(session.user.email)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) {
        setAccountEmail(user.email)
        return
      }

      // Small retry for hash parsing
      setTimeout(async () => {
        const {
          data: { session: s2 },
        } = await supabase.auth.getSession()
        if (s2?.user?.email) {
          setAccountEmail(s2.user.email)
        } else if (!window.location.hash.includes('access_token')) {
          setAccountEmail('Chưa xác thực')
          showAlert('Vui lòng mở liên kết đặt lại mật khẩu từ email của bạn để tiếp tục.')
        }
      }, 1000)
    } catch (err) {
      console.warn(`${logPrefix} Session check error:`, err)
    }
  }

  checkSession()

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      hideAlert()

      const newPassword = newPasswordInput?.value
      const confirmPassword = confirmPasswordInput?.value

      if (!newPassword || !confirmPassword) {
        return showAlert('Vui lòng nhập đầy đủ mật khẩu mới và xác nhận mật khẩu.')
      }

      const weaknessReason = getPasswordWeaknessReason(newPassword)
      if (weaknessReason) {
        return showAlert(weaknessReason)
      }

      if (newPassword !== confirmPassword) {
        return showAlert('Xác nhận mật khẩu không khớp. Vui lòng kiểm tra lại.')
      }

      setLoading(true)

      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        })

        if (error) throw error

        showAlert(successMessage, true)

        // Auto logout to ensure clean state
        try {
          await supabase.auth.signOut()
        } catch (_) {}

        setTimeout(() => {
          window.location.href = redirectPath
        }, 1500)
      } catch (err) {
        console.error(`${logPrefix} Update password error:`, err)
        let msg = 'Không thể đặt lại mật khẩu. Vui lòng yêu cầu gửi lại email mới.'
        if (err.message) {
          if (err.message.includes('Auth session missing')) {
            msg = 'Phiên khôi phục đã hết hạn. Vui lòng gửi lại yêu cầu quên mật khẩu.'
          } else {
            msg = `Lỗi: ${err.message}`
          }
        }
        showAlert(msg)
      } finally {
        setLoading(false)
      }
    })
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
    const input =
      (targetId ? document.getElementById(targetId) : null) ||
      btn.parentElement?.querySelector('input')
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

/**
 * Đăng nhập xong khách quay lại đúng trang đang xem (vd một bài trong Kho tab),
 * thay vì luôn bị đưa sang trang cá nhân. login.js kiểm tra ?redirect= bằng
 * safeRedirectPath() nên chỉ chấp nhận đường dẫn trong site.
 */
function initAuthReturnLinks() {
  document
    .querySelectorAll('#desktop-auth-container a[href="/login.html"], #mobile-auth-container a[href="/login.html"]')
    .forEach((a) => (a.href = withReturnTo('/login.html')))
  document
    .querySelectorAll('#desktop-auth-container a[href="/register.html"], #mobile-auth-container a[href="/register.html"]')
    .forEach((a) => (a.href = withReturnTo('/register.html')))
}

document.addEventListener('DOMContentLoaded', () => {
  initAuthReturnLinks()
  initBottomNav()
  initAuthHeader()
  initNavActiveSpy()
  initMobileHeaderScroll()
  initPasswordToggles()
  initMobileKeyboardScroll()
})
initBottomNav()
initNavActiveSpy()
initMobileHeaderScroll()
initPasswordToggles()
initMobileKeyboardScroll()
