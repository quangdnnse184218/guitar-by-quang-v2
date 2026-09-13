/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — HOME CONTROLLER (main.js)
 * ==============================================================================
 * Faithful recreation of the original home page structure, enriched with
 * v2's Glassmorphism & Light/Dark Theme System.
 */

import {
  initNavbarShrink,
  initMobileMenu,
  initCardTouchFeedback,
  initHeaderOverlapFix,
} from './common.js'
import { initThemeToggle } from './theme-toggle.js'
import {
  fetchFeaturedSongs,
  extractYoutubeId,
  normalizeVideoPath,
  normalizeAudioPath,
} from './lib/songs-service.js'
import { fetchAllGears } from './lib/gears-service.js'
import { applyScrollReveal, applyHeroEntrance } from './animations/scroll-reveal.js'
import { toggleCompleted } from './lib/local-storage-service.js'
import { supabase } from './lib/supabase.js'
import { renderSongCard } from './lib/song-card.js'
import { initShareButtons } from './lib/share-song.js'
import {
  createOrderAndBuildQr,
  downloadQrImage,
  watchOrderPayment,
  uploadAndVerifyHssvCard,
  buildVietQrUrl,
} from './lib/checkout-order.js'

// 1. Initialize UI Globals
initNavbarShrink()
initMobileMenu()
initThemeToggle()
initCardTouchFeedback()
initHeroTiltEffect()
initHeaderOverlapFix()

// ==========================================================================
// STATE
// ==========================================================================
let featuredSongs = []
let activeCheckoutSyntax = ''
// Bài đang mở trong modal — để nút chia sẻ biết đang chia sẻ bài nào.
let activeShareSong = null

// Songs the logged-in user already bought — blocks re-purchase and shows an
// "Đã Mua" state on the card instead, mirroring the same set in kho-tab.js.
let purchasedSongIds = new Set()

// Hàm hủy theo dõi đơn hàng đang chờ thanh toán (xem watchOrderPayment) —
// chỉ có 1 đơn được theo dõi tại 1 thời điểm (modal thanh toán chỉ mở 1 lúc).
let stopOrderWatch = null

// Đơn hàng + user của lượt thanh toán đang mở — cần cho nút "Xác minh thẻ HSSV".
let activeOrder = null
let activeUserId = null

async function loadPurchasedIds() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) {
    purchasedSongIds = new Set()
    return
  }
  const { data, error } = await supabase.from('purchases').select('song_id').eq('user_id', session.user.id)
  if (error) {
    console.warn('[main] Không thể tải danh sách đã mua:', error.message)
    return
  }
  purchasedSongIds = new Set((data || []).map((r) => String(r.song_id)))
}

window.navigateToPurchasesTab = function () {
  window.location.href = '/user-dashboard.html#purchases'
}

// Toast Notification
const toastNotification = document.getElementById('toast-notification')
const toastMessage = document.getElementById('toast-message')
let toastTimer = null

export function showToast(msg, type = 'success') {
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
// ==========================================================================
// GEARS RENDERING (2-COLUMN ON MOBILE / MAX 4 INITIALLY WITH SEE MORE BUTTON)
// ==========================================================================

export function renderGears(gears) {
  const container = document.getElementById('gear-container')
  if (!container || !gears || gears.length === 0) return

  const showMoreWrap = document.getElementById('gear-show-more-wrap')
  const showMoreBtn = document.getElementById('gear-show-more-btn')
  const showMoreText = document.getElementById('gear-show-more-text')
  const showMoreIcon = document.getElementById('gear-show-more-icon')

  container.innerHTML = gears
    .map((gear, idx) => {
      const buyButtonHtml =
        gear.buy_url || gear.buyUrl
          ? `<a href="${gear.buy_url || gear.buyUrl}" target="_blank" rel="noopener noreferrer" class="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-accent-primary/10 hover:bg-warm-gradient hover:text-white text-accent-primary text-xs font-bold transition-all duration-200 group/btn shadow-xs hover:shadow-md">
          <span>${gear.buy_text || gear.buyText || 'Mua trên Shopee'}</span>
          <svg class="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </a>`
          : `<div class="w-full text-center py-1.5 text-xs font-bold text-accent-primary italic truncate">${gear.footer_text || gear.footerText ? `"${(gear.footer_text || gear.footerText).replace(/"/g, '')}"` : ''}</div>`

      const cleanDesc = (gear.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
      const cleanTitle = (gear.title || gear.name || '')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
      const imagePath = gear.image
        ? gear.image.startsWith('/')
          ? gear.image
          : '/' + gear.image
        : '/assets/clover.jpg'
      const extraClass = idx >= 4 ? 'gear-card-extra hidden' : ''

      return `
      <div class="w-full glass-card card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm hover:shadow-xl hover:border-accent-primary/50 border border-glass-border transition-all duration-300 flex flex-col justify-between group overflow-hidden ${extraClass}">
        <div class="space-y-2.5 sm:space-y-3">
          <!-- Khung ảnh vuông 1:1 -->
          <div onclick="window.openImageModal('${imagePath}', '${cleanTitle}', '${cleanDesc}')" class="w-full aspect-square rounded-xl sm:rounded-2xl bg-white/95 dark:bg-white/[0.06] flex items-center justify-center p-2.5 sm:p-3.5 border border-glass-border shadow-inner overflow-hidden group/img relative cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-300" title="Click để phóng to ảnh">
            <img src="${imagePath}" alt="${cleanTitle}" class="w-full h-full object-contain filter drop-shadow-xs transition-transform duration-300 group-hover/img:scale-105" onerror="this.src='/assets/clover.jpg'" />
            <div class="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 p-1 sm:p-1.5 rounded-lg bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm shadow-sm pointer-events-none">
              <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
            </div>
          </div>
          <div>
            <span class="text-[9px] sm:text-[10px] font-extrabold font-mono tracking-widest text-accent-primary uppercase block mb-1">${gear.category || 'PHỤ KIỆN'}</span>
            <h4 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-snug line-clamp-1" title="${cleanTitle}">${gear.title || gear.name}</h4>
            <p class="text-[11px] sm:text-xs text-text-muted font-medium leading-relaxed mt-1 line-clamp-2" title="${cleanDesc}">${gear.description || ''}</p>
          </div>
        </div>
        <div class="pt-2.5 mt-2.5 border-t border-glass-border">
          ${buyButtonHtml}
        </div>
      </div>
    `
    })
    .join('')

  // Configure Show More Button
  if (showMoreWrap && showMoreBtn && gears.length > 4) {
    showMoreWrap.classList.remove('hidden')
    let isExpanded = false
    const extraCount = gears.length - 4

    showMoreText.textContent = `Xem thêm (${extraCount} món đồ khác)`

    showMoreBtn.onclick = () => {
      isExpanded = !isExpanded
      const extraCards = container.querySelectorAll('.gear-card-extra')
      extraCards.forEach((card) => {
        if (isExpanded) {
          card.classList.remove('hidden')
          card.classList.add('animate-in', 'fade-in', 'zoom-in-95', 'duration-200')
        } else {
          card.classList.add('hidden')
          card.classList.remove('animate-in', 'fade-in', 'zoom-in-95', 'duration-200')
        }
      })

      if (isExpanded) {
        showMoreText.textContent = 'Thu gọn bớt'
        if (showMoreIcon) showMoreIcon.classList.add('rotate-180')
      } else {
        showMoreText.textContent = `Xem thêm (${extraCount} món đồ khác)`
        if (showMoreIcon) showMoreIcon.classList.remove('rotate-180')
      }
    }
  } else if (showMoreWrap) {
    showMoreWrap.classList.add('hidden')
  }

  applyScrollReveal('#gear-container .glass-card')
}

// ==========================================================================
// FAQ INTERACTIONS (CATEGORIES & EXPAND/COLLAPSE ALL)
// ==========================================================================

export function initFaq() {
  const faqItems = Array.from(document.querySelectorAll('#faq .faq-item'))
  const filterBtns = document.querySelectorAll('[data-faq-filter]')
  const showMoreWrap = document.getElementById('faq-show-more-wrap')
  const showMoreBtn = document.getElementById('faq-show-more-btn')
  const showMoreText = document.getElementById('faq-show-more-text')
  const showMoreIcon = document.getElementById('faq-show-more-icon')

  if (!faqItems.length) return

  let currentCategory = 'all'
  let isShowMore = false
  const INITIAL_LIMIT = 2

  function updateFaqDisplay() {
    const matchingItems = faqItems.filter((item) => {
      const itemCat = item.getAttribute('data-category')
      return currentCategory === 'all' || itemCat === currentCategory
    })

    const totalMatching = matchingItems.length
    const visibleCount = isShowMore ? totalMatching : Math.min(INITIAL_LIMIT, totalMatching)

    faqItems.forEach((item) => {
      item.classList.add('hidden')
    })

    matchingItems.slice(0, visibleCount).forEach((item) => {
      item.classList.remove('hidden')
    })

    // Cập nhật nút Xem thêm / Thu gọn bớt
    if (showMoreWrap && showMoreBtn && showMoreText) {
      if (totalMatching > INITIAL_LIMIT) {
        showMoreWrap.classList.remove('hidden')
        if (isShowMore) {
          showMoreText.textContent = 'Thu gọn bớt'
          if (showMoreIcon) showMoreIcon.classList.add('rotate-180')
        } else {
          const remaining = totalMatching - INITIAL_LIMIT
          showMoreText.textContent = `Xem thêm ${remaining} câu hỏi`
          if (showMoreIcon) showMoreIcon.classList.remove('rotate-180')
        }
      } else {
        showMoreWrap.classList.add('hidden')
      }
    }
  }

  // 1. Lọc theo chủ đề
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      currentCategory = btn.getAttribute('data-faq-filter') || 'all'
      isShowMore = false
      updateFaqDisplay()
    })
  })

  // 2. Nút Xem thêm / Thu gọn bớt
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      isShowMore = !isShowMore
      updateFaqDisplay()
    })
  }

  // Khởi tạo hiển thị lần đầu
  updateFaqDisplay()
}

// ==========================================================================
// COMPLETED HANDLER
// ==========================================================================
// (Favorites have no UI on the homepage — see kho-tab.js for the real,
// account-only, Supabase-backed favorite toggle.)

window.handleToggleCompleted = function handleToggleCompleted(event, songId) {
  if (event) event.stopPropagation()
  const nextState = toggleCompleted(songId)
  const btns = document.querySelectorAll(`[data-comp-btn="${songId}"]`)
  btns.forEach((btn) => {
    if (nextState) {
      btn.className =
        'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-emerald-500 text-white scale-105'
      btn.title = 'Đánh dấu chưa học'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    } else {
      btn.className =
        'w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm bg-black/40 text-white/80 hover:text-white hover:bg-black/60'
      btn.title = 'Đã học xong'
      btn.innerHTML = `<svg class="w-3.5 h-3.5 fill-none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`
    }
  })
  showToast(nextState ? 'Đã đánh dấu Đã học xong ✓' : 'Đã bỏ đánh dấu Đã học xong')
}

// ==========================================================================
// MODAL CONTROLLER
// ==========================================================================

export function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId)
  if (!modal) return
  const dialog = modal.querySelector('.modal-dialog')

  if (show) {
    modal.classList.remove('hidden')
    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0', 'pointer-events-none')
      modal.classList.add('opacity-100', 'pointer-events-auto')
      if (dialog) {
        dialog.classList.remove('scale-95')
        dialog.classList.add('scale-100')
      }
      document.body.classList.add('modal-open')
    })
  } else {
    modal.querySelectorAll('video').forEach((v) => v.pause())
    modal.querySelectorAll('audio').forEach((a) => {
      a.pause()
      a.currentTime = 0
    })
    const iframe = modal.querySelector('iframe')
    if (iframe) iframe.src = ''

    if (modalId === 'checkout-modal' && stopOrderWatch) {
      stopOrderWatch()
      stopOrderWatch = null
    }

    modal.classList.add('opacity-0', 'pointer-events-none')
    modal.classList.remove('opacity-100', 'pointer-events-auto')
    if (dialog) {
      dialog.classList.add('scale-95')
      dialog.classList.remove('scale-100')
    }
    setTimeout(() => {
      modal.classList.add('hidden')
      document.body.classList.remove('modal-open')
    }, 300)
  }
}

window.toggleModal = toggleModal

window.openVideoDemoModal = function openVideoDemoModal(title, mediaSrc, isAudio = false) {
  if (!title || !mediaSrc) return
  const titleEl = document.getElementById('video-demo-title')
  const videoEl = document.getElementById('demo-modal-video')
  const iframeEl = document.getElementById('demo-modal-iframe')
  const audioContainer = document.getElementById('demo-modal-audio-container')
  const audioEl = document.getElementById('demo-modal-audio')

  if (titleEl) titleEl.textContent = title

  const isAudioFile = isAudio || /\.(mp3|wav|ogg|m4a|aac)(\?.*)?$/i.test(mediaSrc)

  if (isAudioFile && audioEl && audioContainer) {
    if (iframeEl) {
      iframeEl.src = ''
      iframeEl.classList.add('hidden')
    }
    if (videoEl) {
      videoEl.pause?.()
      videoEl.src = ''
      videoEl.classList.add('hidden')
    }
    const cleanSrc = normalizeAudioPath(mediaSrc)
    const encodedSrc = cleanSrc.startsWith('http') ? cleanSrc : encodeURI(cleanSrc)
    audioEl.src = encodedSrc
    audioContainer.classList.remove('hidden')
    audioEl.currentTime = 0
    audioEl.load()
    audioEl.play().catch(() => {})
  } else {
    if (audioContainer && audioEl) {
      audioEl.pause?.()
      audioEl.src = ''
      audioContainer.classList.add('hidden')
    }

    const ytId = extractYoutubeId(mediaSrc)

    if (ytId && iframeEl) {
      iframeEl.src = `https://www.youtube.com/embed/${ytId}?autoplay=1`
      iframeEl.classList.remove('hidden')
      if (videoEl) {
        videoEl.pause?.()
        videoEl.src = ''
        videoEl.classList.add('hidden')
      }
    } else if (videoEl) {
      if (iframeEl) {
        iframeEl.src = ''
        iframeEl.classList.add('hidden')
      }
      const cleanSrc = normalizeVideoPath(mediaSrc)
      const encodedSrc = cleanSrc.startsWith('http') ? cleanSrc : encodeURI(cleanSrc)
      videoEl.src = encodedSrc
      const sourceEl = videoEl.querySelector('source')
      if (sourceEl) sourceEl.src = encodedSrc
      videoEl.classList.remove('hidden')
      videoEl.currentTime = 0
      videoEl.load()
      videoEl.play().catch(() => {})
    }
  }

  toggleModal('video-demo-modal', true)
}

window.openImageModal = function openImageModal(src, title, caption) {
  const imgEl = document.getElementById('image-modal-img')
  const titleEl = document.getElementById('image-modal-title')
  const captionEl = document.getElementById('image-modal-caption')

  if (imgEl) imgEl.src = src
  if (titleEl) titleEl.textContent = title || 'Xem Chi Tiết'
  if (captionEl) captionEl.textContent = caption || ''

  toggleModal('image-preview-modal', true)
}

window.downloadCheckoutQr = function downloadCheckoutQr() {
  const qrImgEl = document.getElementById('modal-qr-img')
  if (!qrImgEl?.src) return
  downloadQrImage(qrImgEl.src).catch((err) => {
    console.error('Không tải được ảnh QR:', err)
    showToast('Không tải được ảnh QR, thử lại nhé!', 'error')
  })
}

// ==========================================================================
// MODAL CONTROLLER — CHECKOUT & FREE TAB
// ==========================================================================

window.openCheckoutModal = async function openCheckoutModal(tabId) {
  if (!featuredSongs || !featuredSongs.length) return
  const tab = featuredSongs.find((t) => t.id === tabId)
  if (!tab) return

  // Gate Check for paid cards: MUST BE LOGGED IN
  let currentUserId
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session || !session.user) {
      const loginBtn = document.getElementById('auth-required-login-btn')
      if (loginBtn) {
        loginBtn.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
      }
      toggleModal('auth-required-modal', true)
      return
    }
    currentUserId = session.user.id
    activeUserId = currentUserId
  } catch (e) {
    console.warn('Auth check error in openCheckoutModal:', e)
    const loginBtn = document.getElementById('auth-required-login-btn')
    if (loginBtn) {
      loginBtn.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
    }
    toggleModal('auth-required-modal', true)
    return
  }

  // Already owns this tab — send to purchases instead of re-selling it.
  if (purchasedSongIds.has(String(tabId))) {
    window.navigateToPurchasesTab()
    return
  }

  const titleEl = document.getElementById('modal-tab-title')
  const metaEl = document.getElementById('modal-tab-meta')
  const priceEl = document.getElementById('modal-tab-price')
  const syntaxEl = document.getElementById('modal-transfer-syntax')
  const qrImgEl = document.getElementById('modal-qr-img')
  const qrTriggerEl = document.getElementById('qr-preview-trigger')
  const discountTag = document.getElementById('modal-discount-tag')
  const levelEl = document.getElementById('modal-tab-level')
  const tuningEl = document.getElementById('modal-tab-tuning')
  const capoEl = document.getElementById('modal-tab-capo')
  const tempoEl = document.getElementById('modal-tab-tempo')
  const durationEl = document.getElementById('modal-tab-duration')
  const videoEl = document.getElementById('checkout-modal-video')
  const videoSrcEl = document.getElementById('checkout-modal-video-source')
  const videoContainer = document.getElementById('checkout-modal-video-container')
  const audioEl = document.getElementById('checkout-modal-audio')
  const audioContainer = document.getElementById('checkout-modal-audio-container')

  if (titleEl) titleEl.textContent = tab.title
  if (metaEl)
    metaEl.textContent = `Tuning: ${tab.tuning || 'Standard'} • Bản Video Tab chạy nốt đồng bộ với âm thanh đàn mộc thật và nhịp gõ`
  if (priceEl) priceEl.textContent = tab.price_formatted || tab.priceFormatted || '239.000 VNĐ'

  if (levelEl) levelEl.textContent = tab.level || `${tab.level_num ?? tab.levelNum ?? 5}/10`
  if (tuningEl) tuningEl.textContent = tab.tuning || 'Standard'
  if (capoEl) capoEl.textContent = tab.capo || 'Không kẹp'
  if (tempoEl) tempoEl.textContent = tab.tempo || '~95 BPM'
  if (durationEl) durationEl.textContent = tab.duration || '03:30'

  const discountNote = tab.discount_note || tab.discountNote || ''
  if (discountTag) {
    if (discountNote) {
      discountTag.textContent = `(${discountNote})`
      discountTag.classList.remove('hidden')
    } else {
      discountTag.classList.add('hidden')
    }
  }

  // Reset khối HSSV về trạng thái ban đầu mỗi lần mở modal cho 1 bài mới —
  // chỉ hiện nếu bài có giá ưu đãi (discount_note), ẩn hẳn nếu không.
  activeOrder = null
  const hssvBlock = document.getElementById('modal-hssv-block')
  const hssvCheckbox = document.getElementById('modal-hssv-checkbox')
  const hssvPanel = document.getElementById('modal-hssv-upload-panel')
  const hssvFileInput = document.getElementById('modal-hssv-file-input')
  const hssvVerifyBtn = document.getElementById('modal-hssv-verify-btn')
  const hssvStatus = document.getElementById('modal-hssv-status')
  if (hssvBlock) hssvBlock.classList.toggle('hidden', !discountNote)
  if (hssvCheckbox) hssvCheckbox.checked = false
  if (hssvPanel) hssvPanel.classList.add('hidden')
  if (hssvFileInput) {
    hssvFileInput.value = ''
    hssvFileInput.disabled = false
  }
  if (hssvVerifyBtn) {
    hssvVerifyBtn.disabled = true
    hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
  }
  if (hssvStatus) {
    hssvStatus.classList.add('hidden')
    hssvStatus.textContent = ''
  }

  const cleanSongCode = tab.title
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
  activeCheckoutSyntax = `VIDEOTAB ${cleanSongCode}`
  if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax

  // Tạo đơn hàng riêng + QR nhúng sẵn số tiền/nội dung — để SePay webhook tự
  // đối chiếu đúng người-đúng bài khi có tiền vào, thay vì phải cấp quyền tay.
  if (stopOrderWatch) {
    stopOrderWatch()
    stopOrderWatch = null
  }

  if (currentUserId) {
    createOrderAndBuildQr(currentUserId, tab)
      .then(({ orderCode, qrUrl, order }) => {
        if (!orderCode) return
        activeOrder = order
        activeCheckoutSyntax = orderCode
        if (syntaxEl) syntaxEl.textContent = activeCheckoutSyntax
        if (qrImgEl) qrImgEl.src = qrUrl
        if (qrTriggerEl) {
          qrTriggerEl.onclick = () =>
            window.openImageModal(
              qrUrl,
              'Mã QR Chuyển Khoản TPBank (03970202801)',
              'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
            )
        }

        // Tự động phát hiện khi SePay webhook xác nhận thanh toán — không cần
        // người dùng tự bấm làm mới hay đoán xem đã cấp quyền chưa.
        stopOrderWatch = watchOrderPayment(orderCode, {
          onPaid: () => {
            stopOrderWatch = null
            purchasedSongIds.add(String(tab.id))
            toggleModal('checkout-modal', false)
            showToast(`Chuyển khoản thành công! Đã mở khoá "${tab.title}" 🎉`, 'success')
            setTimeout(() => window.navigateToPurchasesTab(), 1200)
          },
        })
      })
      .catch((err) => console.warn('Không tạo được đơn hàng tự động:', err))
  }

  const videoDemo = tab.demo_video_url || tab.video_demo || tab.videoDemo || tab.youtube_id || ''
  const audioDemo = tab.audio_demo || tab.demo_audio_url || tab.audio_url || ''

  if (videoEl && videoContainer) {
    if (videoDemo) {
      const cleanVideo = normalizeVideoPath(videoDemo)
      const encodedVideo = cleanVideo.startsWith('http') ? cleanVideo : encodeURI(cleanVideo)
      videoEl.src = encodedVideo
      if (videoSrcEl) videoSrcEl.src = encodedVideo
      videoEl.load()
      videoContainer.classList.remove('hidden')
    } else {
      videoEl.src = ''
      videoContainer.classList.add('hidden')
    }
  }

  if (audioEl && audioContainer) {
    if (audioDemo) {
      const cleanAudio = normalizeAudioPath(audioDemo)
      const encodedAudio = cleanAudio.startsWith('http') ? cleanAudio : encodeURI(cleanAudio)
      audioEl.src = encodedAudio
      audioEl.load()
      audioContainer.classList.remove('hidden')
    } else {
      audioEl.src = ''
      audioContainer.classList.add('hidden')
    }
  }

  toggleModal('checkout-modal', true)
}

window.openFreeTabModal = function openFreeTabModal(tabId) {
  if (!featuredSongs || !featuredSongs.length) return
  const tab = featuredSongs.find((t) => t.id === tabId)
  if (!tab) return

  activeShareSong = { id: tab.id, title: tab.title }

  const titleEl = document.getElementById('free-tab-modal-title')
  const levelEl = document.getElementById('free-tab-modal-level')
  const tuningEl = document.getElementById('free-tab-modal-tuning')
  const durationEl = document.getElementById('free-tab-modal-duration')
  const capoEl = document.getElementById('free-tab-modal-capo')
  const tempoEl = document.getElementById('free-tab-modal-tempo')
  const techContainer = document.getElementById('free-tab-modal-techniques')
  const iframeEl = document.getElementById('free-tab-iframe')
  const localVideoEl = document.getElementById('free-tab-local-video')
  const backupLinkEl = document.getElementById('free-tab-backup-link')
  const pdfBtn = document.getElementById('free-tab-pdf-btn')

  if (titleEl) titleEl.textContent = tab.title
  if (levelEl) levelEl.textContent = tab.level || `${tab.level_num ?? tab.levelNum ?? 5}/10`
  if (tuningEl) tuningEl.textContent = tab.tuning || 'Standard'
  if (durationEl) durationEl.textContent = tab.duration || '03:15'
  if (capoEl) capoEl.textContent = tab.capo || 'Không kẹp'
  if (tempoEl) tempoEl.textContent = tab.tempo || '~95 BPM'

  if (techContainer) {
    let techs = ['Tỉa ngón', 'Slap', 'Nail Attack']
    if (tab.description) {
      const descLower = tab.description.toLowerCase()
      const detected = []
      if (descLower.includes('slap')) detected.push('Slap')
      if (descLower.includes('nail attack')) detected.push('Nail Attack')
      if (descLower.includes('hammer') || descLower.includes('pull'))
        detected.push('Hammer-on / Pull-off')
      if (descLower.includes('slide') || descLower.includes('vuốt'))
        detected.push('Slide (Vuốt dây)')
      if (descLower.includes('rải') || descLower.includes('tỉa')) detected.push('Tỉa ngón / Rải')
      if (descLower.includes('bass')) detected.push('Đi Bass')
      if (detected.length > 0) techs = detected
    }
    techContainer.innerHTML = techs
      .map(
        (t) =>
          `<span class="px-2.5 py-1 rounded-lg modal-inner-card text-text-primary text-[11px] font-semibold shadow-xs">${t}</span>`
      )
      .join('')
  }

  const videoUrl = tab.target_url || tab.targetUrl || tab.video_demo || tab.videoDemo || ''
  let isYouTube = false
  let embedUrl = videoUrl

  if (videoUrl.includes('youtube.com/watch?v=')) {
    const videoId = videoUrl.split('watch?v=')[1]?.split('&')[0]
    embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`
    isYouTube = true
  } else if (videoUrl.includes('youtu.be/')) {
    const videoId = videoUrl.split('youtu.be/')[1]?.split('?')[0]
    embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`
    isYouTube = true
  }

  if (isYouTube && iframeEl) {
    iframeEl.src = embedUrl
    iframeEl.classList.remove('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
  } else if (tab.has_demo && tab.video_demo && localVideoEl) {
    const cleanVideo = tab.video_demo.startsWith('/') ? tab.video_demo : '/' + tab.video_demo
    localVideoEl.src = cleanVideo
    localVideoEl.classList.remove('hidden')
    if (iframeEl) iframeEl.classList.add('hidden')
  } else if (iframeEl) {
    iframeEl.src = ''
    iframeEl.classList.add('hidden')
    if (localVideoEl) localVideoEl.classList.add('hidden')
  }

  if (backupLinkEl) backupLinkEl.href = videoUrl || '#'

  if (pdfBtn) {
    const pdfUrl = tab.pdf_url || tab.pdfUrl
    if (pdfUrl) {
      pdfBtn.removeAttribute('disabled')
      pdfBtn.href = pdfUrl
      pdfBtn.target = '_blank'
      pdfBtn.className =
        'w-full py-3 rounded-2xl bg-warm-gradient hover:brightness-105 text-white font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 text-center cursor-pointer active:scale-95'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 fill-none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Tải file PDF Tab</span>
      `
    } else {
      pdfBtn.setAttribute('disabled', 'true')
      pdfBtn.removeAttribute('href')
      pdfBtn.className =
        'w-full py-3 rounded-2xl bg-glass-bg/40 border border-glass-border/50 text-text-faint font-semibold text-xs transition-all shadow-xs flex items-center justify-center gap-2 text-center cursor-not-allowed opacity-60 pointer-events-none'
      pdfBtn.innerHTML = `
        <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Tải file PDF (Đang cập nhật)</span>
      `
    }
  }

  toggleModal('free-tab-modal', true)
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

function setupEventListeners() {
  const closeCheckoutBtn = document.getElementById('close-checkout-modal')
  if (closeCheckoutBtn)
    closeCheckoutBtn.addEventListener('click', () => toggleModal('checkout-modal', false))

  const closeFreeBtn = document.getElementById('close-free-tab-modal')
  if (closeFreeBtn)
    closeFreeBtn.addEventListener('click', () => toggleModal('free-tab-modal', false))

  const closeVideoDemoBtn = document.getElementById('close-video-demo-modal')
  if (closeVideoDemoBtn)
    closeVideoDemoBtn.addEventListener('click', () => toggleModal('video-demo-modal', false))

  const closeImageModalBtn = document.getElementById('close-image-modal')
  if (closeImageModalBtn)
    closeImageModalBtn.addEventListener('click', () => toggleModal('image-preview-modal', false))

  const closeAuthReqBtn = document.getElementById('close-auth-required-modal')
  if (closeAuthReqBtn)
    closeAuthReqBtn.addEventListener('click', () => toggleModal('auth-required-modal', false))

  const qrTrigger = document.getElementById('qr-preview-trigger')
  if (qrTrigger) {
    qrTrigger.addEventListener('click', () => {
      window.openImageModal(
        '/assets/qr.jpg',
        'Mã QR Chuyển Khoản TpBank (03970202801)',
        'Quét mã QR bằng App Ngân hàng bất kỳ để nhận bản Video Tab và hỗ trợ 1-1 qua Zalo.'
      )
    })
  }

  const copyStkBtn = document.getElementById('copy-stk-btn')
  if (copyStkBtn) {
    copyStkBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('03970202801')
        showToast('Đã sao chép số tài khoản TpBank: 03970202801 📋')
      } catch (e) {
        showToast('Không thể sao chép tự động.')
      }
    })
  }

  const copySyntaxBtn = document.getElementById('copy-syntax-btn')
  if (copySyntaxBtn) {
    copySyntaxBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(activeCheckoutSyntax || 'VIDEOTAB TAB')
        showToast(`Đã sao chép cú pháp: ${activeCheckoutSyntax} 📋`)
      } catch (e) {
        showToast('Không thể sao chép tự động.')
      }
    })
  }

  initShareButtons(
    () => activeShareSong,
    (msg) => showToast(msg)
  )

  const modals = [
    'checkout-modal',
    'free-tab-modal',
    'video-demo-modal',
    'image-preview-modal',
    'auth-required-modal',
  ]
  modals.forEach((id) => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) toggleModal(id, false)
      })
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modals.forEach((id) => toggleModal(id, false))
  })

  initHssvVerification()
}

// Checkbox "Tôi là HSSV" → hiện panel upload ảnh thẻ. Chọn ảnh xong bấm "Xác
// minh" → upload lên bucket riêng tư + gọi Edge Function verify-hssv-card
// (AI kiểm tra thẻ). Nếu đạt, đổi luôn giá + QR sang giá HSSV — không cần
// admin duyệt tay.
function initHssvVerification() {
  const hssvCheckbox = document.getElementById('modal-hssv-checkbox')
  const hssvPanel = document.getElementById('modal-hssv-upload-panel')
  const hssvFileInput = document.getElementById('modal-hssv-file-input')
  const hssvVerifyBtn = document.getElementById('modal-hssv-verify-btn')
  const hssvStatus = document.getElementById('modal-hssv-status')

  if (hssvCheckbox && hssvPanel) {
    hssvCheckbox.addEventListener('change', () => {
      hssvPanel.classList.toggle('hidden', !hssvCheckbox.checked)
    })
  }

  if (hssvFileInput && hssvVerifyBtn) {
    hssvFileInput.addEventListener('change', () => {
      hssvVerifyBtn.disabled = !hssvFileInput.files?.length
    })
  }

  if (hssvVerifyBtn) {
    hssvVerifyBtn.addEventListener('click', async () => {
      const file = hssvFileInput?.files?.[0]
      if (!file || !activeOrder?.id || !activeUserId) return

      hssvVerifyBtn.disabled = true
      hssvVerifyBtn.textContent = 'Đang xác minh...'
      if (hssvStatus) {
        hssvStatus.classList.remove('hidden')
        hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-text-muted'
        hssvStatus.textContent = 'Đang xác minh... chờ chút nhé'
      }

      try {
        const result = await uploadAndVerifyHssvCard(activeUserId, activeOrder.id, file)

        if (result?.approved) {
          activeOrder.amount = result.newAmount || activeOrder.amount
          const qrImgEl = document.getElementById('modal-qr-img')
          const priceEl = document.getElementById('modal-tab-price')
          const discountTag = document.getElementById('modal-discount-tag')
          const newQrUrl = buildVietQrUrl(activeOrder.amount, activeCheckoutSyntax)
          if (qrImgEl) qrImgEl.src = newQrUrl
          const qrTriggerEl = document.getElementById('qr-preview-trigger')
          if (qrTriggerEl) {
            qrTriggerEl.onclick = () =>
              window.openImageModal(
                newQrUrl,
                'Mã QR Chuyển Khoản TPBank (03970202801)',
                'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'
              )
          }
          if (priceEl) priceEl.textContent = `${activeOrder.amount.toLocaleString('vi-VN')} VNĐ`
          if (discountTag) discountTag.textContent = '✓ Đã xác minh HSSV'

          if (hssvStatus) {
            hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400'
            hssvStatus.textContent = '✓ Đã xác minh! Mã QR đã đổi sang giá HSSV.'
          }
          hssvVerifyBtn.textContent = 'Đã xác minh ✓'
          if (hssvFileInput) hssvFileInput.disabled = true
        } else {
          if (hssvStatus) {
            hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-rose-600 dark:text-rose-400'
            hssvStatus.textContent =
              result?.reason || 'Không xác minh được thẻ HSSV, bạn có thể thử ảnh khác hoặc thanh toán giá thường.'
          }
          hssvVerifyBtn.disabled = false
          hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
        }
      } catch (err) {
        console.error('Lỗi xác minh HSSV:', err)
        if (hssvStatus) {
          hssvStatus.className = 'font-bold text-[11px] leading-relaxed text-rose-600 dark:text-rose-400'
          hssvStatus.textContent = 'Có lỗi khi xác minh, thử lại giúp mình nhé.'
        }
        hssvVerifyBtn.disabled = false
        hssvVerifyBtn.textContent = 'Xác minh thẻ HSSV'
      }
    })
  }
}

// ==========================================================================
// HERO TILT EFFECT — mouse-follow parallax on desktop only
// ==========================================================================
// Trước đây có thêm hiệu ứng nghiêng theo con quay hồi chuyển (gyroscope)
// cho mobile, nhưng công thức giả định điện thoại luôn cầm nghiêng ~45° so
// với mặt phẳng — trong thực tế đa số người cầm điện thoại gần như thẳng
// đứng, nên rotX luôn lệch về một phía tối đa, khiến video hiển thị bị
// "nghiêng" cố định trông như lỗi thay vì hiệu ứng tinh tế. Bỏ hẳn phần
// gyroscope, chỉ giữ hiệu ứng nghiêng theo con trỏ chuột trên desktop (nơi
// vị trí luôn xác định chính xác, không phụ thuộc cách cầm máy).
function initHeroTiltEffect() {
  const card = document.getElementById('hero-tilt-card')
  if (!card) return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const MAX_TILT = 8 // degrees, kept subtle so it reads as polish, not motion sickness

  card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
  card.style.willChange = 'transform'

  const applyTilt = (rotX, rotY) => {
    card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg)`
  }

  // Desktop: tilt follows cursor position over the card
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    card.style.transition = 'transform 0.1s ease-out'
    applyTilt(-py * MAX_TILT * 2, px * MAX_TILT * 2)
  })

  card.addEventListener('mouseleave', () => {
    card.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
    applyTilt(0, 0)
  })
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

async function initHome() {
  setupEventListeners()

  // Màn ra mắt cho hero (badge → tiêu đề → đoạn giới thiệu → CTA) ngay lúc
  // tải trang — trước đây mọi thứ hiện cùng lúc, không có nhịp xuất hiện nào
  // dù phần nội dung bên dưới đã có applyScrollReveal khi cuộn tới.
  applyHeroEntrance('.hero-reveal-item')

  // Reveal static sections (About story/step cards, FAQ items, Contact service
  // cards) as they scroll into view — previously only song/gear cards animated.
  applyScrollReveal('.reveal-item', { stagger: 0.08 })
  applyScrollReveal('.faq-item', { stagger: 0.06 })

  // 1. Fetch & Render Featured Songs
  ;[featuredSongs] = await Promise.all([fetchFeaturedSongs(), loadPurchasedIds()])
  const featuredContainer = document.getElementById('featured-grid')
  if (featuredContainer) {
    if (featuredSongs && featuredSongs.length > 0) {
      const songsHtml = featuredSongs
        .slice(0, 4)
        .map((tab) =>
          renderSongCard(tab, {
            extraClass: 'shrink-0 snap-start w-[62%] sm:w-[38%] md:w-full',
            isPurchased: purchasedSongIds.has(String(tab.id)),
          })
        )
        .join('')

      featuredContainer.innerHTML = songsHtml
      applyScrollReveal('#featured-grid .song-card')
    } else {
      featuredContainer.innerHTML = `
        <div class="col-span-full py-10 text-center text-text-muted glass-card p-6 rounded-3xl">
          Có chút trục trặc khi kết nối, anh em tải lại trang giúp mình nhé! 🎸
        </div>
      `
    }
  }

  // 2. Fetch & Render Gears
  const gears = await fetchAllGears()
  renderGears(gears)

  // 3. Initialize FAQ Interactions
  initFaq()
}

initHome()
