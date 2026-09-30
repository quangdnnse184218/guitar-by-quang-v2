/**
 * THẺ ĐỒ NGHỀ DÙNG CHUNG (trang chủ + trang Công cụ) — dạng HÀNG NGANG gọn:
 * ảnh vuông nhỏ bên trái (bấm để phóng to), bên phải loại · tên · mô tả ngắn ·
 * một link hành động. Máy tính 2 cột, điện thoại 1 cột (khung lưới do trang đặt).
 * Trước là thẻ dọc cao ~480px (ảnh lồng 2 lớp khung, nút to, đường kẻ), 2 cột hẹp
 * trên điện thoại làm chữ xuống dòng liên tục.
 */
import { escapeHtml } from '../admin/format.js'

/** Số món hiện sẵn trước khi bấm "Xem thêm" (dạng hàng gọn nên hiện đủ 6). */
export const GEAR_INITIAL_LIMIT = 6

const ARROW_ICON =
  '<svg class="w-3.5 h-3.5 transition-transform group-hover/link:translate-x-0.5" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>'

const LINK_CLASS =
  'group/link inline-flex items-center gap-1 text-xs font-bold text-accent-primary hover:underline underline-offset-2 w-fit'

/** Chuỗi nhúng vào onclick="...('…')" — escape cả nháy và ký tự HTML. */
function jsArg(str) {
  return escapeHtml(String(str || '')).replace(/\\/g, '\\\\').replace(/&#039;/g, "\\'")
}

export function renderGearCard(gear, idx) {
  const title = gear.title || gear.name || ''
  const description = gear.description || ''
  const note = (gear.footer_text || gear.footerText || '').trim()
  const buyUrl = gear.buy_url || gear.buyUrl
  const imagePath = gear.image
    ? gear.image.startsWith('/') || /^https?:\/\//.test(gear.image)
      ? gear.image
      : '/' + gear.image
    : '/assets/clover.jpg'
  const extraClass = idx >= GEAR_INITIAL_LIMIT ? 'gear-card-extra hidden' : ''

  // Có link mua → "Mua ngay"; không có → ghi chú của admin (nếu có) + hỏi qua Zalo.
  const actionHtml = buyUrl
    ? `<a href="${escapeHtml(buyUrl)}" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}"><span>${escapeHtml(gear.buy_text || gear.buyText || 'Mua ngay')}</span>${ARROW_ICON}</a>`
    : `<a href="https://zalo.me/0326768885" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}"><span>Hỏi qua Zalo</span>${ARROW_ICON}</a>`
  const noteHtml = note
    ? `<p class="hidden sm:block text-[11px] text-text-faint font-medium leading-snug line-clamp-2">${escapeHtml(note)}</p>`
    : ''

  // Chỉ cho phóng to khi trang có hộp xem ảnh (trang Công cụ không có — trước đây
  // bấm vào ảnh ở đó báo lỗi mà không có gì xảy ra).
  const canZoom = typeof window !== 'undefined' && typeof window.openImageModal === 'function'
  const imgInner = `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(title)}" loading="lazy" class="w-full h-full object-contain transition-transform duration-300 group-hover/img:scale-105" onerror="this.src='/assets/clover.jpg'" />`
  const thumbClass =
    'group/img flex-shrink-0 w-20 h-20 sm:w-28 sm:h-28 rounded-xl bg-white dark:bg-white/[0.06] border border-glass-border p-1.5 overflow-hidden'
  const thumbHtml = canZoom
    ? `<button type="button" onclick="window.openImageModal('${jsArg(imagePath)}', '${jsArg(title)}', '${jsArg(description)}')" class="${thumbClass} cursor-zoom-in" aria-label="Phóng to ảnh ${escapeHtml(title)}">${imgInner}</button>`
    : `<div class="${thumbClass}">${imgInner}</div>`

  return `
      <article class="gear-row flex gap-3.5 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-glass-bg border border-glass-border hover:border-accent-primary/40 hover:shadow-md transition-all ${extraClass}">
        ${thumbHtml}
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-accent-primary truncate">${escapeHtml(gear.category || 'Phụ kiện')}</span>
          <h4 class="-mt-0.5 text-sm sm:text-base font-bold text-text-primary leading-snug truncate" title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
          <p class="text-xs text-text-muted leading-relaxed line-clamp-2">${escapeHtml(description)}</p>
          ${noteHtml}
          <div class="mt-auto pt-0.5">${actionHtml}</div>
        </div>
      </article>
    `
}
