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
 * lên tường cá nhân, nên chỉ còn 2 nút:
 * - Zalo: dùng bảng chia sẻ của hệ điều hành (Web Share API) — người dùng chọn
 *   được bất kỳ app nào đang cài (Zalo, SMS, Telegram...) rồi chọn đúng người/
 *   nhóm nhận ngay trong app đó. Trình duyệt không hỗ trợ (chủ yếu là máy tính)
 *   thì rơi về mở thẳng hộp thoại chia sẻ của Zalo trên web.
 * - Messenger: trên điện thoại mở thẳng app bằng deep link `fb-messenger://`
 *   (Messenger hiện danh sách người nhận). Trên máy tính, Messenger không cho
 *   mở hộp thoại gửi nếu không đăng ký Facebook App ID riêng, nên fallback là
 *   copy link kèm hướng dẫn dán vào Messenger.
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

  function shareContext() {
    const song = getActiveSong?.() || null
    const url = buildSongShareUrl(song?.id)
    const title = song?.title || 'Video Tab Guitar'
    const text = `Guitar tab "${title}" trên Guitar By Quang — xem tại:`
    return { url, title, text }
  }

  if (zaloBtn) {
    zaloBtn.addEventListener('click', async () => {
      const { url, title, text } = shareContext()

      // Ưu tiên bảng chia sẻ hệ điều hành — cho chọn đúng người/nhóm nhận
      // ngay trong app (Zalo, SMS, Telegram...) thay vì chỉ đăng chung chung.
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url })
        } catch {
          // Người dùng bấm huỷ bảng chia sẻ — không phải lỗi, bỏ qua.
        }
        return
      }

      // Trình duyệt không hỗ trợ Web Share API (chủ yếu là máy tính) — rơi về
      // mở thẳng hộp thoại chia sẻ của Zalo trên web.
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
          : 'Hãy copy link rồi dán vào Messenger nhé'
      )
      window.open('https://www.messenger.com/', '_blank')
    })
  }
}
