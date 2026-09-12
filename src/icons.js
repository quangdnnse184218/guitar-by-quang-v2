/**
 * ==============================================================================
 * GUITAR BY QUANG v2 — SHARED INLINE SVG ICONS (icons.js)
 * ==============================================================================
 * Thay cho emoji dùng làm icon chức năng (dropdown, badge, thẻ bài hát...) —
 * emoji hiển thị khác nhau tùy hệ điều hành/trình duyệt và không đổi màu theo
 * theme được. Mỗi hàm nhận vào className Tailwind để gọi nơi dùng tự set kích
 * thước, màu icon lấy theo currentColor của phần tử cha.
 */

export const iconGuitar = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 260 480" fill="currentColor" aria-hidden="true"><rect x="115" y="0" width="30" height="220" rx="14"/><rect x="102" y="0" width="56" height="32" rx="12"/><ellipse cx="130" cy="270" rx="72" ry="62"/><ellipse cx="130" cy="385" rx="108" ry="92"/></svg>`

export const iconHeart = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.25c-4.5-2.7-9-6.44-9-10.5C3 6.5 5.5 4 8.25 4c1.6 0 3 .8 3.75 2.1C12.75 4.8 14.15 4 15.75 4 18.5 4 21 6.5 21 9.75c0 4.06-4.5 7.8-9 10.5z"/></svg>`

export const iconBolt = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4.5 14h6L9 22l10-13h-6.5L13 2z"/></svg>`

export const iconPerson = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.5" r="3.75"/><path d="M4.5 20.25a7.5 7.5 0 0115 0 .75.75 0 01-.75.75h-13.5a.75.75 0 01-.75-.75z"/></svg>`

export const iconLogout = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H2.25"/></svg>`

export const iconCrown = (cls = 'w-3.5 h-3.5') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 18h18l-1.5-9-4.5 4-3-6-3 6-4.5-4L3 18z"/></svg>`

export const iconCalendar = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0V11.25a2.25 2.25 0 012.25-2.25h13.5a2.25 2.25 0 012.25 2.25v7.5"/></svg>`

export const iconChartBar = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125h4.5v7.125H3v-7.125zM9.75 8.25h4.5v12h-4.5v-12zM16.5 4.5H21v15.75h-4.5V4.5z"/></svg>`

export const iconHeadphones = (cls = 'w-4 h-4') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" d="M4 14v-2.5a8 8 0 1116 0V14"/><rect x="2.5" y="13" width="4.5" height="6.5" rx="2"/><rect x="17" y="13" width="4.5" height="6.5" rx="2"/></svg>`
