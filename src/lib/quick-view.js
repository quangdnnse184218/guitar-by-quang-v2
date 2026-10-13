/**
 * ==============================================================================
 * XEM NHANH MỘT BÀI (kho tab)
 * ==============================================================================
 * Bấm vào thẻ bài ở kho tab thì hiện cửa sổ nhỏ: video demo (nếu có), mô tả, độ
 * khó, giá và nút hành động đúng với trạng thái của khách (đã mua / miễn phí /
 * trả phí). Khách xem đủ thông tin để quyết định mà không phải rời lưới bài; chỉ
 * khi bấm nút chính mới đi tiếp sang cửa sổ thanh toán hoặc xem tab miễn phí.
 */
import { normalizeVideoPath, normalizeAudioPath } from './songs-service.js'
import { iconHeadphones, iconGuitar } from '../icons.js'
import { renderLevelDots, renderStatusChips, renderHssvNote } from './song-card.js'
import { formatCompactPrice } from './song-format.js'

const MODAL_ID = 'quick-view-modal'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function mediaHtml(song) {
  const rawVideo = song.demo_video_url || song.video_demo || song.videoDemo || ''
  const rawAudio = song.audio_demo || song.demo_audio_url || song.audio_url || ''
  const bg = song.thumbnail_bg || song.thumbnailBg || 'from-[#C1602F] to-[#6E3B1F]'
  const isYoutube = /youtu\.?be/i.test(rawVideo)

  if (rawVideo && !isYoutube) {
    const src = normalizeVideoPath(rawVideo)
    const encoded = src.startsWith('http') ? src : encodeURI(src)
    return `<video class="qv-video" src="${escapeHtml(encoded)}" controls playsinline preload="metadata"></video>`
  }
  if (rawAudio) {
    const src = normalizeAudioPath(rawAudio)
    const encoded = src.startsWith('http') ? src : encodeURI(src)
    return `<div class="qv-art bg-gradient-to-br ${bg}">
      <span class="qv-art-icon">${iconHeadphones('w-7 h-7')}</span>
      <audio src="${escapeHtml(encoded)}" controls preload="none" class="w-full max-w-xs mt-3"></audio>
    </div>`
  }
  return `<div class="qv-art bg-gradient-to-br ${bg}">
    <span class="qv-art-icon">${iconGuitar('w-7 h-7')}</span>
    <span class="text-xs font-bold text-white/85 mt-2">Chưa có video demo cho bài này</span>
  </div>`
}

function factsHtml(song) {
  const tuning = (song.tuning || '').trim()
  const facts = []
  if (song.duration) facts.push(`<span class="font-mono tabular-nums">${escapeHtml(song.duration)}</span>`)
  if (tuning) facts.push(`<span>Tuning ${escapeHtml(tuning)}</span>`)
  if (song.capo) facts.push(`<span>Capo ${escapeHtml(song.capo)}</span>`)
  if (song.category) facts.push(`<span>${escapeHtml(song.category)}</span>`)
  return renderLevelDots(song.level_num ?? song.levelNum ?? song.level, song.level) + facts.join('')
}

function ctaHtml(song, { isFree, isPurchased }) {
  if (isPurchased) {
    return `<button type="button" data-qv-action="owned" class="qv-cta qv-cta-owned">Mở tab đã mua</button>`
  }
  if (isFree) {
    return `<button type="button" data-qv-action="free" class="qv-cta qv-cta-free">Xem tab miễn phí</button>`
  }
  const price = formatCompactPrice(song.price_formatted || song.priceFormatted || song.price)
  const hssv = renderHssvNote(song.discount_note || song.discountNote || '')
  return `
    ${hssv ? `<div class="mb-2.5 flex items-center justify-center">${hssv}</div>` : ''}
    <button type="button" data-qv-action="buy" class="qv-cta qv-cta-buy">Mua tab · <span class="uppercase tabular-nums">${escapeHtml(price)}</span></button>`
}

/**
 * @param {object} deps
 * @param {(id: string) => object|undefined} deps.getSong
 * @param {(id: string) => boolean} deps.isPurchased
 * @param {(id: string) => {isNew: boolean, isHot: boolean}} deps.badgesFor
 * @param {(modalId: string, show: boolean) => void} deps.toggleModal
 */
export function initQuickView({ getSong, isPurchased, badgesFor, toggleModal }) {
  const modal = document.getElementById(MODAL_ID)
  if (!modal) return

  const close = () => toggleModal(MODAL_ID, false)

  window.openQuickView = (id) => {
    const song = getSong(id)
    if (!song) return
    const isFree = Boolean(song.is_free ?? song.isFree)
    const owned = isPurchased(String(song.id))

    modal.querySelector('#qv-media').innerHTML = mediaHtml(song)
    modal.querySelector('#qv-chips').innerHTML = renderStatusChips(badgesFor(String(song.id)))
    modal.querySelector('#qv-title').textContent = song.title || ''
    modal.querySelector('#qv-singer').textContent = song.singer || ''
    modal.querySelector('#qv-facts').innerHTML = factsHtml(song)
    modal.querySelector('#qv-desc').textContent = song.description || ''
    modal.querySelector('#qv-cta').innerHTML = ctaHtml(song, { isFree, isPurchased: owned })
    modal.dataset.songId = String(song.id)

    toggleModal(MODAL_ID, true)
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) return close()
    const btn = e.target.closest('[data-qv-action]')
    if (!btn) return
    const id = modal.dataset.songId
    close()
    // Đợi hết hiệu ứng đóng rồi mới mở cửa sổ kế tiếp, tránh hai lớp phủ chồng nhau.
    setTimeout(() => {
      if (btn.dataset.qvAction === 'owned') window.navigateToPurchasesTab?.()
      else if (btn.dataset.qvAction === 'free') window.openFreeTabModal?.(id)
      else window.openCheckoutModal?.(id)
    }, 320)
  })
  modal.querySelector('#qv-close')?.addEventListener('click', close)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) close()
  })
}
