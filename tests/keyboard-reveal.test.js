import { describe, it, expect, beforeEach, vi } from 'vitest'
import { keyboardHeight, revealDelta, revealField } from '../src/lib/keyboard-reveal.js'

// jsdom không có bàn phím ảo: giả visualViewport như iOS (bàn phím đè lên, trang không co lại).
function openKeyboard({ innerHeight = 800, keyboard = 320 } = {}) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: { height: innerHeight - keyboard, offsetTop: 0, addEventListener() {} },
  })
}

function fieldAt(top, height = 46) {
  const input = document.createElement('input')
  input.type = 'password'
  document.body.appendChild(input)
  input.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 300 })
  return input
}

describe('keyboard-reveal — giữ ô nhập nằm trên bàn phím ảo', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.body.className = ''
    document.documentElement.style.removeProperty('--kb-space')
  })

  it('đo chiều cao bàn phím từ visualViewport, bỏ qua dao động nhỏ của thanh trình duyệt', () => {
    openKeyboard({ innerHeight: 800, keyboard: 320 })
    expect(keyboardHeight()).toBe(320)
    openKeyboard({ innerHeight: 800, keyboard: 50 })
    expect(keyboardHeight()).toBe(0)
  })

  it('ô đã nhìn thấy trên bàn phím thì không cần cuộn', () => {
    openKeyboard()
    expect(revealDelta(fieldAt(120))).toBe(0)
  })

  it('ô nằm dưới bàn phím thì cần cuộn xuống để đưa lên vùng nhìn thấy', () => {
    openKeyboard() // nhìn thấy 0–480
    const delta = revealDelta(fieldAt(600))
    expect(delta).toBeGreaterThan(600 + 46 - 480)
  })

  it('trang ngắn: chừa khoảng trống bằng bàn phím rồi cuộn trang đưa ô mật khẩu lên', () => {
    openKeyboard({ innerHeight: 800, keyboard: 320 })
    const input = fieldAt(600)
    input.focus()
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    revealField(input)
    expect(document.body.classList.contains('kb-open')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--kb-space')).toBe('320px')
    expect(scrollBy).toHaveBeenCalledTimes(1)
    const [, dy] = scrollBy.mock.calls[0]
    expect(600 - dy + 46).toBeLessThanOrEqual(480) // sau khi cuộn, đáy ô nằm trên bàn phím
    scrollBy.mockRestore()
  })

  it('không làm gì khi ô không phải ô đang nhập (vd checkbox, hoặc ô không có focus)', () => {
    openKeyboard()
    const box = document.createElement('input')
    box.type = 'checkbox'
    document.body.appendChild(box)
    box.focus()
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    revealField(box)
    revealField(fieldAt(600)) // chưa focus
    expect(scrollBy).not.toHaveBeenCalled()
    scrollBy.mockRestore()
  })
})
