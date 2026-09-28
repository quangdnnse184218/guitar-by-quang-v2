import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Hiện dần khi cuộn tới. Trước đây phần tử bị ẩn hẳn (opacity 0) và độ trễ so le
 * tính theo thứ tự TRONG CẢ TRANG (phần tử `.reveal-item` thứ 10 chờ 0.8s dù vừa
 * lọt màn hình) — cuộn nhanh là thấy cả khoảng trống. Giờ: chỉ mờ nhẹ (không
 * bao giờ vô hình), kích hoạt trước khi vào khung nhìn 80px, và so le chỉ giữa
 * các phần tử cùng lọt vào một lượt (ScrollTrigger.batch).
 */
export function applyScrollReveal(selector, options = {}) {
  const els = Array.from(document.querySelectorAll(selector)).filter(
    (el) => el.dataset.revealed !== 'true'
  )
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

  const { stagger = 0.05, ...gsapOptions } = options

  els.forEach((el) => {
    el.dataset.revealed = 'true'
  })

  gsap.set(els, { opacity: 0.35, y: 8 })

  ScrollTrigger.batch(els, {
    start: 'top bottom+=80',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.3,
        ease: 'power2.out',
        // Tổng độ so le cả lượt tối đa 0.25s, dù lượt đó có bao nhiêu phần tử.
        stagger: Math.min(stagger, 0.25 / Math.max(batch.length - 1, 1)),
        overwrite: true,
        clearProps: 'transform,opacity',
        ...gsapOptions,
      }),
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
