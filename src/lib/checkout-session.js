import { createOrderAndBuildQr, watchOrderPayment } from './checkout-order.js'

/**
 * Vòng đời đơn hàng của hộp thanh toán: tạo (hoặc dùng lại) đơn → điền mã đơn + QR → theo dõi tới
 * khi SePay báo đã trả. Dùng chung cho trang chủ, kho tab và trang cá nhân. Trước đây mỗi trang
 * chép một bản và đã từng lệch nhau (sửa lỗi ở trang này, quên trang kia).
 *
 * Bất biến quan trọng: kết quả tạo đơn về MUỘN (khách đã đóng hộp hoặc mở bài khác) bị bỏ qua.
 * Mỗi lần start()/cancel() tăng `seq`; lời gọi nào không còn khớp `seq` thì không được điền QR
 * hay bật theo dõi — nếu không, đơn của bài cũ có thể đè lên hộp thanh toán của bài mới.
 */

export const QR_PREVIEW_TITLE = 'Mã QR chuyển khoản TPBank (03970202801)'
export const QR_PREVIEW_CAPTION =
  'Quét mã QR bằng App Ngân hàng bất kỳ — số tiền và nội dung đã được điền sẵn, chỉ cần xác nhận chuyển khoản.'

/**
 * @param {object} [deps]  chỉ để test thay thế
 */
export function createCheckoutSession({
  createOrder = createOrderAndBuildQr,
  watchPayment = watchOrderPayment,
  openImageModal = (...args) => window.openImageModal?.(...args),
} = {}) {
  let seq = 0
  let stopWatch = null
  let order = null

  /** Dừng theo dõi và bỏ mọi kết quả tạo đơn đang chờ (gọi khi đóng hộp thanh toán). */
  function cancel() {
    seq++
    if (stopWatch) {
      stopWatch()
      stopWatch = null
    }
  }

  /** Như cancel(), và quên luôn đơn đang mở (gọi trước khi mở hộp cho một bài). */
  function reset() {
    cancel()
    order = null
  }

  /**
   * Tạo/dùng lại đơn cho `tab` rồi điền vào hộp thanh toán. Không có userId thì không làm gì
   * (khách chưa đăng nhập chỉ xem chi tiết). Trả về kết quả tạo đơn, hoặc null nếu bị bỏ qua.
   *
   * @param {object} opts
   * @param {string|null} opts.userId
   * @param {object} opts.tab
   * @param {{syntaxEl?: Element|null, qrImgEl?: HTMLImageElement|null, qrTriggerEl?: HTMLElement|null}} [opts.els]
   * @param {(result: {orderCode:string, qrUrl:string, order:object}) => void} [opts.onOrderReady]
   * @param {(amount: number) => void} [opts.onAmountChange]
   * @param {() => void} [opts.onPaid]
   */
  function start(opts) {
    // Trang gọi mà không await: mọi lỗi phải dừng ở đây, không thành unhandled rejection.
    return run(opts).catch((err) => {
      console.warn('Lỗi hộp thanh toán:', err)
      return null
    })
  }

  async function run({ userId, tab, els = {}, onOrderReady, onAmountChange, onPaid }) {
    reset()
    const mySeq = seq
    if (!userId || !tab) return null

    let result
    try {
      result = await createOrder(userId, tab)
    } catch (err) {
      console.warn('Không tạo được đơn hàng tự động:', err)
      return null
    }
    if (mySeq !== seq || !result?.orderCode) return null

    order = result.order
    const { syntaxEl, qrImgEl, qrTriggerEl } = els
    onOrderReady?.(result)
    if (syntaxEl) syntaxEl.textContent = result.orderCode
    if (qrImgEl) qrImgEl.src = result.qrUrl
    if (qrTriggerEl) {
      qrTriggerEl.onclick = () => openImageModal(result.qrUrl, QR_PREVIEW_TITLE, QR_PREVIEW_CAPTION)
    }

    // Tự phát hiện khi SePay webhook xác nhận thanh toán.
    stopWatch = watchPayment(result.orderCode, {
      // Admin áp giá HSSV bằng tay hoặc duyệt lượt đang chờ → trang đổi mã QR ngay.
      onAmountChange,
      onPaid: () => {
        stopWatch = null
        onPaid?.()
      },
    })
    return result
  }

  return {
    start,
    cancel,
    reset,
    getOrder: () => order,
  }
}
