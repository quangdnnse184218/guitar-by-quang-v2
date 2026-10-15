import { describe, it, expect } from 'vitest'
import { buildDisplacementMap } from '../src/lib/liquid-glass.js'

describe('bản đồ khúc xạ', () => {
  it('dựng SVG đúng kích thước pixel của phần tử', () => {
    const svg = buildDisplacementMap(351, 66)
    expect(svg).toContain('width="351"')
    expect(svg).toContain('height="66"')
    expect(svg).toContain('viewBox="0 0 351 66"')
  })

  it('vùng mép dày tối đa 26px; thanh thấp thì lấy nửa chiều cao', () => {
    // thanh cao 66px: dải mép = 26px => 26/351 theo chiều ngang, 26/66 theo chiều dọc
    const tall = buildDisplacementMap(351, 66)
    expect(tall).toContain('offset="0.0741"')
    expect(tall).toContain('offset="0.3939"')
    // thanh cao 30px: nửa chiều cao là 15px => 15/30 = 0.5 theo chiều dọc
    const slim = buildDisplacementMap(300, 30)
    expect(slim).toContain('offset="0.5000"')
  })

  it('dùng kênh R cho trục X và kênh G cho trục Y, lớp G trộn kiểu screen', () => {
    const svg = buildDisplacementMap(200, 60)
    expect(svg).toContain('stop-color="#ff0000"')
    expect(svg).toContain('stop-color="#00ff00"')
    expect(svg).toContain('mix-blend-mode:screen')
  })
})
