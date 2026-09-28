/**
 * THẺ ĐỒ NGHỀ DÙNG CHUNG (trang chủ + trang cá nhân).
 * Trước đây mỗi trang tự giữ một bản chép tay; sửa bên này quên bên kia (lượt dọn
 * giao diện 2026-09-28 sửa trang chủ xong thì trang cá nhân vẫn còn chữ bị cắt và
 * câu trích in nghiêng) — nên gom về một chỗ.
 */
import { escapeHtml } from '../admin/format.js'

const ARROW_ICON =
  '<svg class="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>'

const FOOTER_BUTTON_CLASS =
  'w-full min-h-[36px] inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-accent-primary/10 hover:bg-warm-gradient hover:text-white text-accent-primary text-xs font-bold transition-all duration-200 group/btn shadow-xs hover:shadow-md'

/** Số món hiện sẵn trước khi bấm "Xem thêm"; món thứ 5 trở đi mang class ẩn. */
export const GEAR_INITIAL_LIMIT = 4

export function renderGearCard(gear, idx) {
  const footerText = (gear.footer_text || gear.footerText || '').trim()

  // Món nào cũng kết thúc bằng một nút cùng khuôn: có link mua thì "Mua ngay",
  // không có thì "Nhắn Zalo" (trước là câu trích in nghiêng bị cắt "...").
  const footerButtonHtml =
    gear.buy_url || gear.buyUrl
      ? `<a href="${gear.buy_url || gear.buyUrl}" target="_blank" rel="noopener noreferrer" class="${FOOTER_BUTTON_CLASS}"><span>${gear.buy_text || gear.buyText || 'Mua trên Shopee'}</span>${ARROW_ICON}</a>`
      : `<a href="https://zalo.me/0326768885" target="_blank" rel="noopener noreferrer" class="${FOOTER_BUTTON_CLASS}"><span>Nhắn Zalo</span>${ARROW_ICON}</a>`

  // Ghi chú admin gõ ("Cần mua đàn nhắn mình…") thành dòng gợi ý nhỏ dưới mô tả.
  const footerNoteHtml = footerText
    ? `<p class="flex items-start gap-1 mt-1.5 text-[10px] sm:text-[11px] text-text-faint font-medium leading-snug">
        <svg class="w-3 h-3 mt-px flex-shrink-0 text-accent-primary" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" d="M12 11v5M12 8h.01"/></svg>
        <span>${escapeHtml(footerText)}</span>
      </p>`
    : ''

  const cleanDesc = (gear.description || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
  const cleanTitle = (gear.title || gear.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')
  const imagePath = gear.image
    ? gear.image.startsWith('/')
      ? gear.image
      : '/' + gear.image
    : '/assets/clover.jpg'
  const extraClass = idx >= GEAR_INITIAL_LIMIT ? 'gear-card-extra hidden' : ''

  // Tên tối đa 2 dòng, mô tả KHÔNG cắt (mô tả dài nhất trong DB ~120 ký tự; trước
  // đây line-clamp-2 cắt ngang câu, nhất là thẻ hẹp trên điện thoại).
  return `
      <div class="w-full glass-card card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm hover:shadow-xl hover:border-accent-primary/50 border border-glass-border transition-all duration-300 flex flex-col justify-between group overflow-hidden ${extraClass}">
        <div class="space-y-2.5 sm:space-y-3">
          <div onclick="window.openImageModal('${imagePath}', '${cleanTitle}', '${cleanDesc}')" class="w-full aspect-square rounded-xl sm:rounded-2xl bg-white/95 dark:bg-white/[0.06] flex items-center justify-center p-2.5 sm:p-3.5 border border-glass-border shadow-inner overflow-hidden group/img relative cursor-zoom-in group-hover:scale-[1.02] transition-transform duration-300" title="Click để phóng to ảnh">
            <img src="${imagePath}" alt="${cleanTitle}" class="w-full h-full object-contain filter drop-shadow-xs transition-transform duration-300 group-hover/img:scale-105" onerror="this.src='/assets/clover.jpg'" />
            <div class="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 p-1 sm:p-1.5 rounded-lg bg-black/70 text-white opacity-0 group-hover/img:opacity-100 transition-opacity backdrop-blur-sm shadow-sm pointer-events-none">
              <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
            </div>
          </div>
          <div>
            <span class="text-[9px] sm:text-[10px] font-extrabold tracking-widest text-accent-primary uppercase block mb-1">${gear.category || 'PHỤ KIỆN'}</span>
            <h4 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-snug line-clamp-2" title="${cleanTitle}">${gear.title || gear.name}</h4>
            <p class="text-[11px] sm:text-xs text-text-muted font-medium leading-relaxed mt-1" title="${cleanDesc}">${gear.description || ''}</p>
            ${footerNoteHtml}
          </div>
        </div>
        <div class="pt-2.5 mt-2.5 border-t border-glass-border">
          ${footerButtonHtml}
        </div>
      </div>
    `
}
