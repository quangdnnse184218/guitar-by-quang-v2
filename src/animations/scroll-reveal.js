import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Apply a fast, responsive fade-up reveal to elements matching selector
 */
export function applyScrollReveal(selector, options = {}) {
  const els = document.querySelectorAll(selector)
  if (els.length === 0) return

  els.forEach((el) => {
    gsap.from(el, {
      opacity: 0,
      y: 12,
      duration: 0.3,
      ease: 'power2.out',
      scrollTrigger: { 
        trigger: el, 
        start: 'top 95%',
        once: true
      },
      ...options
    })
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
    onUpdate: (self) => onProgress(self.progress)
  })
}
