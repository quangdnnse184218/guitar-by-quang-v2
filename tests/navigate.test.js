import { describe, it, expect } from 'vitest'
import { safeRedirectPath } from '../src/lib/navigate.js'

describe('safeRedirectPath — chỉ cho quay về trang trong site', () => {
  it('giữ nguyên đường dẫn nội bộ, kể cả query và hash', () => {
    expect(safeRedirectPath('/kho-tab.html?tab=tab-1')).toBe('/kho-tab.html?tab=tab-1')
    expect(safeRedirectPath('/user-dashboard.html#favorites')).toBe('/user-dashboard.html#favorites')
  })

  it.each([
    ['//evil.example/login'],
    ['/\\evil.example'],
    ['https://evil.example'],
    ['javascript:alert(1)'],
    ['/\tevil'],
    [''],
    [null],
    [undefined],
  ])('loại %s và dùng trang mặc định', (raw) => {
    expect(safeRedirectPath(raw)).toBe('/user-dashboard.html')
  })

  it('cho đổi trang mặc định', () => {
    expect(safeRedirectPath('//x', '/')).toBe('/')
  })
})
