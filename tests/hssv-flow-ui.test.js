/**
 * Khối giảm giá sinh viên trong hộp thanh toán (src/lib/hssv-flow.js).
 * Khoá lại yêu cầu: sinh viên phải nộp CÙNG LÚC email trường (đã nhận mã) và ảnh thẻ.
 *  - Ô ảnh thẻ hiện ngay từ đầu (trước đây chỉ hiện sau khi xác nhận mã → khách tưởng chỉ cần email).
 *  - Một nút gửi: thiếu email/mã hoặc thiếu ảnh thì nút tắt; bấm thì xác nhận mã rồi đọc thẻ ngay.
 *  - Mã sai thì KHÔNG tải ảnh lên.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({
  sendHssvEmailCode: vi.fn(),
  checkHssvEmailCode: vi.fn(),
  uploadAndVerifyHssvCard: vi.fn(),
}))

vi.mock('../src/lib/checkout-order.js', () => ({
  buildVietQrUrl: (amount, code) => `https://qr/${amount}/${code}`,
  ...api,
}))

const { initHssvFlow } = await import('../src/lib/hssv-flow.js')

const EMAIL = 'annvse184218@fpt.edu.vn'
let order

function mount() {
  document.body.innerHTML = `
    <div id="modal-hssv-block"></div>
    <img id="modal-qr-img" />
    <span id="modal-tab-price"></span>
    <span id="modal-discount-tag"></span>`
  order = { id: 'o1', amount: 239000 }
  const flow = initHssvFlow({
    getOrder: () => order,
    getUserId: () => 'u1',
    getOrderCode: () => 'DH123456',
  })
  flow.reset({ available: true })
  flow.orderReady()
  const q = (id) => document.getElementById(id)
  const ui = {
    toggle: q('modal-hssv-checkbox'),
    consent: q('modal-hssv-consent'),
    email: q('hssv-email'),
    send: q('hssv-send-btn'),
    codeRow: q('hssv-code-row'),
    code: q('hssv-code'),
    cardRow: q('hssv-card-row'),
    file: q('modal-hssv-file-input'),
    verify: q('modal-hssv-verify-btn'),
    status: q('modal-hssv-status'),
  }
  ui.toggle.click()
  return ui
}

const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }))
const type = (el, value) => {
  el.value = value
  fire(el, 'input')
}
function pickFile(input) {
  const file = new File(['x'], 'the.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fire(input, 'change')
  return file
}
const flush = () => new Promise((r) => setTimeout(r, 0))

async function sendCode(ui) {
  ui.consent.click()
  type(ui.email, EMAIL)
  ui.send.click()
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  api.sendHssvEmailCode.mockResolvedValue({ ok: true })
  api.checkHssvEmailCode.mockResolvedValue({ ok: true })
  api.uploadAndVerifyHssvCard.mockResolvedValue({ approved: true, status: 'approved', newAmount: 179000 })
})

describe('khối HSSV — nộp email trường và ảnh thẻ cùng lúc', () => {
  it('ô ảnh thẻ hiện ngay khi mở, không đợi xác nhận email', () => {
    const ui = mount()
    expect(ui.cardRow.classList.contains('hidden')).toBe(false)
    expect(ui.file).not.toBeNull()
    expect(ui.verify.textContent).toMatch(/email và ảnh thẻ/)
    expect(document.getElementById('hssv-check-btn')).toBeNull() // không còn nút xác nhận mã riêng
  })

  it('thiếu một trong hai (mã email hoặc ảnh thẻ) thì nút gửi tắt', async () => {
    const ui = mount()
    pickFile(ui.file)
    expect(ui.verify.disabled).toBe(true) // có ảnh, chưa có mã

    await sendCode(ui)
    expect(ui.codeRow.classList.contains('hidden')).toBe(false)
    type(ui.code, '12345')
    expect(ui.verify.disabled).toBe(true) // mã chưa đủ 6 số
    type(ui.code, '123456')
    expect(ui.verify.disabled).toBe(false)

    const ui2 = mount()
    await sendCode(ui2)
    type(ui2.code, '123456')
    expect(ui2.verify.disabled).toBe(true) // có mã, chưa có ảnh
  })

  it('chưa tick đồng ý thì không gửi được dù đủ mã và ảnh', async () => {
    const ui = mount()
    await sendCode(ui)
    pickFile(ui.file)
    type(ui.code, '123456')
    ui.consent.click() // bỏ tick
    expect(ui.verify.disabled).toBe(true)
  })

  it('một lần bấm: xác nhận mã rồi đọc thẻ, giá + QR đổi sang giá sinh viên', async () => {
    const ui = mount()
    await sendCode(ui)
    type(ui.code, '123456')
    const file = pickFile(ui.file)
    ui.verify.click()
    await flush()
    await flush()

    expect(api.checkHssvEmailCode).toHaveBeenCalledWith('o1', EMAIL, '123456', { consent: true })
    expect(api.uploadAndVerifyHssvCard).toHaveBeenCalledWith('u1', 'o1', file, { email: EMAIL, consent: true })
    expect(api.checkHssvEmailCode.mock.invocationCallOrder[0]).toBeLessThan(
      api.uploadAndVerifyHssvCard.mock.invocationCallOrder[0]
    )
    expect(document.getElementById('modal-tab-price').textContent).toMatch(/179\.000/)
    expect(document.getElementById('modal-qr-img').getAttribute('src')).toBe('https://qr/179000/DH123456')
    expect(ui.verify.disabled).toBe(true)
    expect(ui.file.disabled).toBe(true)
  })

  it('mã sai thì KHÔNG tải ảnh thẻ lên, báo số lần còn lại', async () => {
    api.checkHssvEmailCode.mockResolvedValue({ ok: false, error: 'wrong_code', attemptsLeft: 4 })
    const ui = mount()
    await sendCode(ui)
    type(ui.code, '000000')
    pickFile(ui.file)
    ui.verify.click()
    await flush()
    expect(api.uploadAndVerifyHssvCard).not.toHaveBeenCalled()
    expect(ui.status.textContent).toMatch(/Mã chưa đúng\. Còn 4 lần thử/)
  })

  it('chờ admin (vd trường trên thẻ không khớp email) → báo lý do, cho gửi ảnh khác không cần nhập lại mã', async () => {
    api.uploadAndVerifyHssvCard.mockResolvedValue({
      approved: false,
      status: 'pending',
      reason: 'Tên trường trên thẻ chưa khớp với email trường bạn nhập nên hệ thống chưa tự duyệt.',
    })
    const ui = mount()
    await sendCode(ui)
    type(ui.code, '123456')
    pickFile(ui.file)
    ui.verify.click()
    await flush()
    await flush()
    expect(ui.status.textContent).toMatch(/Tên trường trên thẻ chưa khớp/)

    pickFile(ui.file)
    expect(ui.verify.disabled).toBe(false) // email đã xác nhận, chỉ cần ảnh mới
    ui.verify.click()
    await flush()
    await flush()
    expect(api.checkHssvEmailCode).toHaveBeenCalledTimes(1)
    expect(api.uploadAndVerifyHssvCard).toHaveBeenCalledTimes(2)
  })
})
