import { describe, it, expect, vi } from 'vitest'

// palette.js và overview.js đọc DOM/Supabase lúc nạp; chỉ cần các hàm thuần nên giả lập phần còn lại.
vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }))

const { fold, matches } = await import('../src/admin/palette.js')
const { greetingFor } = await import('../src/admin/overview.js')

describe('tìm nhanh', () => {
  it('bỏ dấu và chữ hoa khi so khớp', () => {
    expect(fold('Tiền Về')).toBe('tien ve')
    expect(fold('Đồ nghề')).toBe('do nghe')
  })

  it('gõ không dấu vẫn ra trang có dấu', () => {
    expect(matches('tien ve', 'Tiền về Khoản tiền vào tài khoản')).toBe(true)
    expect(matches('cap quyen', 'Cấp quyền thủ công')).toBe(true)
  })

  it('mọi từ phải có mặt, không cần liền nhau', () => {
    expect(matches('huy vip', 'Huy đẹp trai siêu cấp vip pro')).toBe(true)
    expect(matches('huy xyz', 'Huy đẹp trai siêu cấp vip pro')).toBe(false)
  })

  it('tìm được theo email và một phần mã khách', () => {
    expect(matches('ngvanhuy', 'Huy ngvanhuy2907@gmail.com b42c4fe3')).toBe(true)
    expect(matches('b42c', 'Huy ngvanhuy2907@gmail.com b42c4fe3-1111')).toBe(true)
  })

  it('truy vấn rỗng khớp mọi thứ', () => {
    expect(matches('   ', 'bất kỳ')).toBe(true)
  })
})

describe('lời chào Tổng quan', () => {
  it('đổi theo giờ trong ngày', () => {
    expect(greetingFor(8, 'Doan Nguyen Nhat Quang')).toBe('Chào buổi sáng, Quang')
    expect(greetingFor(12, 'Quang')).toBe('Chào buổi trưa, Quang')
    expect(greetingFor(15, 'Quang')).toBe('Chào buổi chiều, Quang')
    expect(greetingFor(22, 'Quang')).toBe('Chào buổi tối, Quang')
  })

  it('chưa có tên thì chỉ chào', () => {
    expect(greetingFor(9, '')).toBe('Chào buổi sáng')
    expect(greetingFor(9, null)).toBe('Chào buổi sáng')
  })
})
