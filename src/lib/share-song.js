/**
 * ==============================================================================
 * CHIA SẺ BÀI TAB QUA TIN NHẮN
 * ==============================================================================
 * Trước đây nút chia sẻ gửi đi `window.location.href` — tức là link trang chung
 * (/kho-tab.html), người nhận bấm vào phải tự mò lại đúng bài. Dự án không có
 * trang riêng cho từng bài nên ở đây dựng link dạng
 * `/kho-tab.html?tab=<id>`; kho-tab.js đọc tham số đó rồi tự mở đúng thẻ bài
 * hát lên (xem openSongFromUrlParam).
 *
 * Về cách chia sẻ: mục tiêu là GỬI CHO MỘT NGƯỜI/NHÓM CỤ THỂ, không phải đăng
 * lên tường cá nhân, nên:
 * - Zalo: mở hộp thoại chia sẻ của Zalo, người dùng chọn bạn bè/nhóm để gửi.
 * - Messenger: trên điện thoại mở thẳng app bằng deep link `fb-messenger://`
 *   (Messenger hiện danh sách người nhận). Trên máy tính, Messenger không cho
 *   mở hộp thoại gửi nếu không đăng ký Facebook App ID riêng, nên fallback là
 *   copy link kèm hướng dẫn dán vào Messenger.
 * - "Gửi qua tin nhắn khác": dùng Web Share API của hệ điều hành — người dùng
 *   chọn được bất kỳ app nhắn tin nào (SMS, Telegram, Zalo, Messenger...) rồi
 *   chọn người nhận ngay trong app đó. Chỉ hiện khi trình duyệt hỗ trợ.
 */

/** Link trỏ thẳng tới đúng bài trong kho tab. */
export function buildSongShareUrl(songId) {
  if (!songId) return `${window.location.origin}/kho-tab.html`
  return `${window.location.origin}/kho-tab.html?tab=${encodeURIComponent(songId)}`
}

function isMobileDevice() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Gắn hành vi cho cụm nút chia sẻ trong modal xem tab.
 * @param {() => {id: string, title: string} | null} getActiveSong Trả về bài
 *        đang mở trong modal tại thời điểm bấm nút.
 * @param {(msg: string) => void} showToast
 */
export function initShareButtons(getActiveSong, showToast) {
  const zaloBtn = document.getElementById('share-zalo-btn')
  const messengerBtn = document.getElementById('share-messenger-btn')
  const systemBtn = document.getElementById('share-system-btn')
  const copyBtn = document.getElementById('share-copy-btn')

  function shareContext() {
    const song = getActiveSong?.() || null
    const url = buildSongShareUrl(song?.id)
    const title = song?.title || 'Video Tab Guitar'
    const text = `Guitar tab "${title}" trên Guitar By Quang — xem tại:`
    return { url, title, text }
  }

  if (zaloBtn) {
    zaloBtn.addEventListener('click', () => {
      const { url } = shareContext()
      window.open(`https://sp.zalo.me/share_inline?link=${encodeURIComponent(url)}`, '_blank')
    })
  }

  if (messengerBtn) {
    messengerBtn.addEventListener('click', async () => {
      const { url } = shareContext()

      if (isMobileDevice()) {
        window.location.href = `fb-messenger://share/?link=${encodeURIComponent(url)}`
        return
      }

      // Trên máy tính không mở được hộp thoại chọn người nhận của Messenger
      // (cần Facebook App ID riêng) — copy sẵn link để người dùng dán vào.
      const ok = await copyToClipboard(url)
      showToast?.(
        ok
          ? 'Đã copy link — mở Messenger rồi dán vào cuộc trò chuyện để gửi 💬'
          : 'Hãy copy link ở nút bên cạnh rồi dán vào Messenger nhé'
      )
      window.open('https://www.messenger.com/', '_blank')
    })
  }

  // Nút dùng bảng chia sẻ của hệ điều hành (chọn app + chọn người nhận).
  // Trình duyệt máy tính phần lớn không có Web Share API nên ẩn nút này đi và
  // cho nút Copy link chiếm trọn hàng, tránh để hở nửa hàng trống.
  if (systemBtn) {
    if (navigator.share) {
      systemBtn.classList.remove('hidden')
      systemBtn.addEventListener('click', async () => {
        const { url, title, text } = shareContext()
        try {
          await navigator.share({ title, text, url })
        } catch {
          // Người dùng bấm huỷ bảng chia sẻ — không phải lỗi, bỏ qua.
        }
      })
    } else {
      systemBtn.classList.add('hidden')
      copyBtn?.classList.add('col-span-2')
    }
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const { url } = shareContext()
      const ok = await copyToClipboard(url)
      showToast?.(ok ? 'Đã copy link bài tab 📋' : 'Không copy được, bạn hãy copy thủ công')
    })
  }
}
