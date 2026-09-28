/**
 * ==============================================================================
 * THẺ BÀI HÁT DÙNG CHUNG
 * ==============================================================================
 * Trước đây mỗi trang (trang chủ, kho tab) tự giữ một bản renderSongCard
 * copy-paste gần giống nhau. Hậu quả thực tế: một lỗi tràn khung ảnh trên
 * mobile phải sửa đi sửa lại ở 7 chỗ, và hai bản đã kịp lệch nhau (trang chủ
 * chèn thẳng đường dẫn video demo trong khi kho tab đã chuẩn hoá qua
 * normalizeVideoPath).
 *
 * Gộp về một nơi, phần khác nhau giữa các trang đưa hết vào `options`:
 * trang chủ chỉ hiện thẻ đơn giản, kho tab thêm nút tim + badge "Nổi bật" +
 * lớp phủ khi vuốt để yêu thích.
 */
import { normalizeVideoPath, normalizeAudioPath } from './songs-service.js'
import { iconHeadphones, iconGuitar, iconHeart, iconGraduationCap } from '../icons.js'
import { extractDiscountPrice } from './song-format.js'

/**
 * Giá trên thẻ trả phí tách làm 2 chỗ thay vì nhồi 2 pill xếp dọc ở góc ảnh (góc
 * đó còn phải chứa thể loại + nút tim, thẻ trên mobile chỉ rộng ~160px):
 * - renderPriceBadge: góc ảnh chỉ còn giá gốc, gọn ngang badge "FREE" của thẻ
 *   miễn phí — liếc lưới là thấy ngay bài nào tốn bao nhiêu.
 * - renderHssvNote: giá HSSV thành chữ nhỏ ở hàng "Độ khó" trong thân thẻ.
 * Cố ý không gạch ngang giá gốc: chỉ HSSV mới được giá thấp, gạch ngang sẽ
 * khiến khách tưởng ai cũng được giảm.
 */
export function renderPriceBadge(priceFormatted) {
  // Cùng khuôn (padding, cỡ chữ, font) với badge "FREE" — chỉ khác màu. Trên
  // mobile hàng này chỉ rộng ~120px: badge dùng font mono cũ rộng hơn FREE
  // đúng 2px là đủ đẩy nút tim xuống dòng.
  return `<span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black text-white bg-gradient-to-r from-rose-600 to-rose-500 shadow-sm uppercase tracking-wide tabular-nums whitespace-nowrap" title="Giá ${priceFormatted}">${priceFormatted}</span>`
}

export function renderHssvNote(discountNote) {
  if (!discountNote) return ''
  const hssvLabel = extractDiscountPrice(discountNote) || discountNote
  // Chip cam = màu "khuyến mãi", tách hẳn khỏi màu đồng của "Độ khó" ngay cạnh
  // (trước cùng màu nên chìm), hồng của giá và xanh của "miễn phí".
  return `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[11px] font-extrabold whitespace-nowrap bg-orange-100 text-orange-700 ring-1 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/40" title="Giá ưu đãi cho học sinh, sinh viên (xác minh thẻ khi thanh toán)">${iconGraduationCap('w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0')}HSSV ${hssvLabel}</span>`
}

/** Tam giác play bo góc (mềm hơn tam giác nhọn cũ), lệch phải 1px cho cân thị giác. */
const PLAY_ICON =
  '<svg class="w-3.5 h-3.5 sm:w-5 sm:h-5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 5.9v12.2c0 .8.9 1.3 1.6.8l9.1-6.1c.6-.4.6-1.2 0-1.6l-9.1-6.1c-.7-.5-1.6 0-1.6.8z"/></svg>'

/** Nhãn nhỏ dưới nút play ("Xem demo"...). Cách nút đủ xa để không đè vòng khảm. */
export const PLAY_LABEL_CLASS =
  'text-[8px] sm:text-[10px] font-bold mt-3 sm:mt-3.5 text-white/95 tracking-wide bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-xs leading-none whitespace-nowrap'

/**
 * Nút play giữa khung ảnh thẻ bài hát — hình lỗ thoát âm đàn acoustic (xem
 * `.play-soundhole` trong style.css). Dùng chung cho mọi thẻ ở mọi trang.
 * `tag: 'div'` khi cả thẻ đã là vùng bấm (thẻ miễn phí) để không lồng 2 nút.
 */
export function renderPlayDisc({ label, icon = PLAY_ICON, tag = 'button' }) {
  const attrs = tag === 'button' ? ` type="button" aria-label="${label}"` : ' aria-hidden="true"'
  return `<${tag} class="play-soundhole w-8 h-8 sm:w-11 sm:h-11"${attrs}>${icon}</${tag}>`
}

/** Escape nháy đơn cho chuỗi nhúng vào thuộc tính onclick="...('...')". */
function escapeJsString(str) {
  return String(str || '').replace(/'/g, "\\'")
}

/**
 * Class của khung ảnh trên thẻ — dùng chung cho cả thẻ ở đây lẫn 3 biến thể
 * thẻ riêng trong trang cá nhân (những thẻ đó có hành động và màu khác nên
 * không gộp chung hàm được, nhưng khung ảnh thì phải giống hệt nhau).
 *
 * Trên mobile dùng CHIỀU CAO CỐ ĐỊNH chứ không phải aspect-ratio: box có
 * aspect-ratio kèm chiều cao tối thiểu sẽ sinh ra chiều rộng tối thiểu tự
 * động (cao 140px với tỉ lệ 4/3 là bắt buộc rộng 186px), làm khung ảnh phình
 * to hơn thẻ chứa nó rồi bị cắt mất mép phải — đúng lỗi đã từng phải sửa ở 7
 * chỗ khác nhau vì code bị lặp.
 */
export const SONG_THUMB_CLASS =
  'relative overflow-hidden rounded-xl sm:rounded-2xl h-[150px] sm:h-auto sm:aspect-[16/10] w-full p-2 sm:p-3.5 flex flex-col justify-between text-white shadow-inner group-hover:scale-[1.02] transition-transform duration-500 ease-out'

/** Badge thể loại ở góc trái khung ảnh (cắt bớt nếu tên thể loại quá dài). */
export function renderCategoryBadge(song, fallback = 'Fingerstyle') {
  // Không dùng font mono + giãn chữ trên mobile: 2 thứ đó làm chữ rộng hơn và bị cắt
  // ("Nhạc Vi…") khi thẻ 2 cột chỉ rộng ~150px.
  return `<span class="bg-black/50 backdrop-blur px-1 sm:px-2 py-0.5 rounded-full text-white/95 text-[8px] sm:text-[10px] tracking-normal sm:tracking-wider truncate min-w-0 max-w-[76px] sm:max-w-none">${song.category || fallback}</span>`
}

/**
 * Hàng dưới cùng khung ảnh: thời lượng bên trái, tuning bên phải.
 * Thời lượng không bao giờ bị co (flex-shrink-0), tuning cắt bằng dấu "..."
 * khi thẻ quá hẹp thay vì bị khung ảnh cắt cụt không báo hiệu gì.
 */
export function renderThumbMetaRow(song, fallbackDuration = 'Full Video') {
  return `
    <div class="flex justify-between items-end gap-1 text-xs text-white/95 font-semibold">
      <span class="font-mono tabular-nums text-[9px] sm:text-[11px] flex-shrink-0">${song.duration || fallbackDuration}</span>
      <span class="text-white/80 text-[8px] sm:text-[11px] truncate min-w-0">Tuning: ${song.tuning || 'Standard'}</span>
    </div>
  `
}

function renderPinnedBadge() {
  return `<span class="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-amber-400 text-black shadow-sm uppercase tracking-wide"><svg class="w-2 h-2 sm:w-2.5 sm:h-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.94 6.34L21.5 9.27l-4.75 4.51L17.88 21 12 17.77 6.12 21l1.13-7.22L2.5 9.27l6.56-.93z"/></svg>Nổi bật</span>`
}

/** Lớp phủ hiện ra giữa chừng khi vuốt thẻ sang phải để yêu thích. */
function renderSwipeOverlay() {
  return `
    <div class="swipe-fav-overlay absolute inset-0 flex items-center justify-center rounded-2xl sm:rounded-3xl opacity-0 pointer-events-none z-30 bg-rose-500/90">
      <span class="text-white">${iconHeart('w-9 h-9 sm:w-10 sm:h-10')}</span>
    </div>
  `
}

/**
 * Nút tim luôn hiện trên thẻ. Vuốt-để-yêu-thích không đủ rõ ràng để người dùng
 * tự khám phá ra, nên mỗi thẻ vẫn cần một nút bấm tường minh. Nút nằm cùng
 * hàng badge FREE/giá (không đặt absolute trên thẻ) để không bao giờ đè lên
 * mép bo tròn của khung ảnh.
 */
function renderFavoriteButton(tab, isFavorite) {
  const filledHeart =
    '<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
  const outlineHeart =
    '<svg class="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'

  return `
    <button
      type="button"
      onclick="event.stopPropagation(); window.handleToggleFavorite(event, '${tab.id}')"
      data-fav-btn="${tab.id}"
      title="${isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}"
      class="relative before:absolute before:-inset-2 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-sm ${isFavorite ? 'bg-rose-500 text-white' : 'bg-black/40 text-white/80 hover:text-white hover:bg-black/60'}"
    >
      ${isFavorite ? filledHeart : outlineHeart}
    </button>
  `
}

/** Phần giữa khung ảnh của thẻ trả phí: đã mua / xem demo video / nghe demo audio. */
function renderPaidArtworkCenter(tab, { isPurchased, video, audio }) {
  if (isPurchased) {
    return `
      <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.navigateToPurchasesTab()">
        ${renderPlayDisc({ label: 'Mở tab đã mua' })}
        <span class="${PLAY_LABEL_CLASS}">Xem trong tab đã mua</span>
      </div>
    `
  }

  if (video) {
    return `
      <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.openVideoDemoModal('${escapeJsString(tab.title)}', '${escapeJsString(video)}', false)">
        ${renderPlayDisc({ label: 'Xem demo' })}
        <span class="${PLAY_LABEL_CLASS}">Xem demo</span>
      </div>
    `
  }

  if (audio) {
    return `
      <div class="my-auto text-center flex flex-col items-center justify-center py-0.5" onclick="event.stopPropagation(); window.openVideoDemoModal('${escapeJsString(tab.title)}', '${escapeJsString(audio)}', true)">
        ${renderPlayDisc({ label: 'Nghe audio demo', icon: iconHeadphones('w-3.5 h-3.5 sm:w-5 sm:h-5') })}
        <span class="${PLAY_LABEL_CLASS}">Nghe audio demo</span>
      </div>
    `
  }

  return `
    <div class="my-auto text-center flex flex-col items-center justify-center opacity-80 py-0.5">
      <div class="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-black/30 flex items-center justify-center text-white shadow-sm">
        ${iconGuitar('w-3 h-3 sm:w-3.5 sm:h-3.5')}
      </div>
      <span class="text-[8px] sm:text-[10px] font-bold mt-0.5 text-white/80 tracking-wide">Acoustic Tab</span>
    </div>
  `
}

/**
 * Dựng HTML một thẻ bài hát.
 *
 * @param {object} tab Bản ghi bài hát lấy từ bảng `songs`
 * @param {object} [options]
 * @param {string} [options.extraClass]   Class thêm vào thẻ (vd cho carousel cuộn ngang)
 * @param {boolean} [options.isPinned]    Hiện badge "Nổi bật"
 * @param {boolean} [options.isFavorite]  Trạng thái tim hiện tại
 * @param {boolean} [options.isPurchased] Người dùng đã mua bài này chưa
 * @param {boolean} [options.showFavoriteButton] Có hiện nút tim không (trang chủ thì không)
 * @param {boolean} [options.showSwipeOverlay]   Có lớp phủ vuốt-để-yêu-thích không
 */
export function renderSongCard(tab, options = {}) {
  const {
    extraClass = '',
    isPinned = false,
    isFavorite = false,
    isPurchased = false,
    showFavoriteButton = false,
    showSwipeOverlay = false,
  } = options

  const levelNum = tab.level_num ?? tab.levelNum ?? 5
  const percent = Math.min(100, Math.max(10, (levelNum / 10) * 100))
  const isFree = tab.is_free ?? tab.isFree ?? false

  const pinnedClass = isPinned ? 'song-card-pinned' : ''
  const pinnedBadge = isPinned ? renderPinnedBadge() : ''
  const swipeOverlay = showSwipeOverlay ? renderSwipeOverlay() : ''
  const favButton = showFavoriteButton ? renderFavoriteButton(tab, isFavorite) : ''

  // Khung ảnh: trên mobile dùng chiều cao cố định thay vì aspect-ratio, vì
  // aspect-ratio kèm chiều cao tối thiểu sẽ sinh ra chiều rộng tối thiểu tự
  // động làm khung ảnh phình rộng hơn thẻ rồi bị cắt mất mép phải.

  const levelRow = (accentClass, barClass, rightSlot = '') => `
    <div class="space-y-0.5 sm:space-y-1 pt-0.5">
      <div class="flex flex-wrap items-center justify-between gap-x-1 gap-y-1 text-[10px] sm:text-xs font-bold text-text-muted">
        <span class="whitespace-nowrap">Độ khó: <strong class="${accentClass} font-mono tabular-nums">${tab.level || levelNum + '/10'}</strong></span>
        ${rightSlot}
      </div>
      <div class="w-full bg-glass-bg rounded-full h-1 sm:h-1.5 overflow-hidden border border-glass-border">
        <div class="${barClass} h-1 sm:h-1.5 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
      </div>
    </div>
  `

  // ------------------------------------------------------------------ FREE
  if (isFree) {
    return `
      <div onclick="window.openFreeTabModal('${tab.id}')" class="song-card glass-card card-interactive p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-glass-border flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer ${pinnedClass} ${extraClass}" data-id="${tab.id}">
        ${swipeOverlay}
        <div class="space-y-2 sm:space-y-3">
          <div class="${SONG_THUMB_CLASS} bg-gradient-to-br from-[#1E3A2F] via-[#2A4D3E] to-[#172A22]">
            <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
              ${renderCategoryBadge(tab, 'Fingerstyle')}
              <div class="flex items-center gap-1 flex-wrap justify-end">
                ${pinnedBadge}
                <span class="px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[10px] font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide">FREE</span>
                ${favButton}
              </div>
            </div>

            <div class="my-auto text-center flex flex-col items-center justify-center py-0.5">
              ${renderPlayDisc({ label: 'Xem tab miễn phí', tag: 'div' })}
              <span class="${PLAY_LABEL_CLASS}">Xem tab miễn phí</span>
            </div>

            ${renderThumbMetaRow(tab)}
          </div>

          <div class="space-y-1">
            <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors leading-tight line-clamp-3">
              ${tab.title}
            </h3>
            ${levelRow('text-emerald-700 dark:text-emerald-400', 'bg-emerald-600 dark:bg-emerald-400')}
          </div>
        </div>

        <div class="pt-1 sm:pt-2">
          <div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] sm:text-xs transition-all shadow-md shadow-emerald-900/20 flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
            <span class="truncate">Xem Video Tab (Free)</span>
          </div>
        </div>
      </div>
    `
  }

  // ------------------------------------------------------------------ PAID
  const priceFormatted = tab.price_formatted || tab.priceFormatted || '239k'
  const discountNote = tab.discount_note || tab.discountNote || ''
  const thumbnailBg = tab.thumbnail_bg || tab.thumbnailBg || 'from-[#C1602F] to-[#6E3B1F]'

  const rawVideo = tab.demo_video_url || tab.video_demo || tab.videoDemo || tab.youtube_id || ''
  const rawAudio = tab.audio_demo || tab.demo_audio_url || tab.audio_url || ''
  const video = rawVideo ? normalizeVideoPath(rawVideo) : ''
  const audio = rawAudio ? normalizeAudioPath(rawAudio) : ''

  const badgeHtml = isPurchased
    ? `
    <span class="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[9.5px] font-black bg-emerald-600 text-white shadow-sm uppercase tracking-wide flex items-center gap-0.5">
      <svg class="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
      <span>ĐÃ MUA</span>
    </span>
  `
    : renderPriceBadge(priceFormatted)

  return `
    <div onclick="${isPurchased ? 'window.navigateToPurchasesTab()' : `window.openCheckoutModal('${tab.id}')`}" class="song-card glass-card card-interactive p-2.5 sm:p-4 rounded-2xl sm:rounded-3xl border ${isPurchased ? 'border-amber-500/40 hover:border-amber-400' : 'border-glass-border'} flex flex-col justify-between space-y-2.5 sm:space-y-3.5 group cursor-pointer card-paid ${pinnedClass} ${extraClass}" data-id="${tab.id}">
      ${swipeOverlay}
      <div class="space-y-2 sm:space-y-3">
        <div class="${SONG_THUMB_CLASS} bg-gradient-to-br ${thumbnailBg}">
          <div class="flex justify-between items-start text-xs uppercase font-bold tracking-wider">
            ${renderCategoryBadge(tab, 'Nhạc Việt')}
            <div class="flex items-start gap-1 flex-wrap justify-end">
              ${pinnedBadge}
              ${badgeHtml}
              ${favButton}
            </div>
          </div>

          ${renderPaidArtworkCenter(tab, { isPurchased, video, audio })}

          ${renderThumbMetaRow(tab)}
        </div>

        <div class="space-y-1">
          <h3 class="text-xs sm:text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors leading-tight line-clamp-3">
            ${tab.title}
          </h3>
          ${levelRow('text-accent-primary', 'bg-warm-gradient', isPurchased ? '' : renderHssvNote(discountNote))}
        </div>
      </div>

      <div class="pt-1 sm:pt-2">
        ${
          isPurchased
            ? `<div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 font-extrabold text-[10px] sm:text-xs transition-all shadow-xs flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
          <span class="truncate">Mở tab đã mua</span>
        </div>`
            : `<div class="w-full py-1.5 sm:py-2.5 px-1.5 rounded-full bg-warm-gradient hover:opacity-90 text-white font-bold text-[10px] sm:text-xs transition-all shadow-md shadow-accent-primary/20 flex items-center justify-center gap-1 active:scale-95 text-center cursor-pointer">
          <span class="truncate">Xem chi tiết</span>
        </div>`
        }
      </div>
    </div>
  `
}
