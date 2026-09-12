import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Apply a fast, responsive fade-up reveal to elements matching selector
 */
export function applyScrollReveal(selector, options = {}) {
  const els = document.querySelectorAll(selector)
  if (els.length === 0) return

  // Mọi lời gọi applyScrollReveal (card bài hát, FAQ, gear...) đều phải tôn
  // trọng "giảm hiệu ứng chuyển động" — trước đây chỉ hiệu ứng nghiêng 3D ở
  // hero (initHeroTiltEffect) có kiểm tra này, còn hiệu ứng hiện dần khi cuộn
  // thì không, nên người bật Reduce Motion vẫn phải xem mọi thứ trượt/mờ dần
  // liên tục. Đánh dấu revealed để giữ nguyên trạng thái hiển thị bình
  // thường, không chặn nội dung xuất hiện — chỉ bỏ qua animation.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    els.forEach((el) => {
      el.dataset.revealed = 'true'
    })
    return
  }

  const { stagger = 0, ...gsapOptions } = options

  els.forEach((el, i) => {
    if (el.dataset.revealed === 'true') return
    el.dataset.revealed = 'true'

    gsap.from(el, {
      opacity: 0,
      y: 10,
      duration: 0.25,
      delay: stagger * i,
      ease: 'power2.out',
      clearProps: 'transform,opacity',
      scrollTrigger: {
        trigger: el,
        start: 'top 98%',
        once: true,
      },
      ...gsapOptions,
    })
  })
}

/**
 * Chuỗi xuất hiện so le cho các khối trong hero ngay lúc tải trang (khác với
 * applyScrollReveal — hero luôn nằm trong khung nhìn đầu tiên nên phải chạy
 * ngay, không đợi cuộn tới). Cũng tôn trọng prefers-reduced-motion.
 */
export function applyHeroEntrance(selector, options = {}) {
  const els = document.querySelectorAll(selector)
  if (els.length === 0) return

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const { stagger = 0.09, ...gsapOptions } = options

  gsap.from(els, {
    opacity: 0,
    y: 14,
    duration: 0.5,
    stagger,
    ease: 'power3.out',
    clearProps: 'transform,opacity',
    ...gsapOptions,
  })
}

/**
 * Bind 3D Guitar rotation to Hero section scroll progress
 */
export function bindGuitarRotationToScroll(heroSectionEl, onProgress) {
  ScrollTrigger.create({
    trigger: heroSectionEl,
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => onProgress(self.progress),
  })
}
