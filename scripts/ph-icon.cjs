/**
 * Lấy mã SVG của một biểu tượng Phosphor (https://phosphoricons.com, MIT) từ gói
 * `@phosphor-icons/core` để DÁN THẲNG vào HTML/JS — trang không tải thêm thư viện nào lúc chạy.
 *
 *   node scripts/ph-icon.cjs metronome duotone "w-8 h-8"
 *
 * Kiểu (weight): regular · bold · fill · duotone (hai lớp, lớp nền mờ 20%) · light · thin.
 * Biểu tượng tô bằng `currentColor` nên đổi màu bằng lớp chữ (text-accent-primary…).
 * Quy ước của site: biểu tượng "minh hoạ" (thẻ công cụ, dịch vụ) dùng duotone; biểu tượng
 * trong nút/dòng chữ dùng regular hoặc bold; logo mạng xã hội dùng fill.
 */
const fs = require('fs')
const path = require('path')

function phIcon(name, weight = 'regular', cls = 'w-5 h-5') {
  const file = path.join(
    __dirname,
    '..',
    'node_modules',
    '@phosphor-icons',
    'core',
    'assets',
    weight,
    weight === 'regular' ? `${name}.svg` : `${name}-${weight}.svg`
  )
  if (!fs.existsSync(file)) throw new Error(`Không có biểu tượng Phosphor "${name}" kiểu "${weight}"`)
  const svg = fs.readFileSync(file, 'utf8').trim()
  // bỏ xmlns (không cần khi nhúng trong HTML), thêm lớp kích thước + ẩn khỏi trình đọc màn hình
  return svg.replace(
    /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /,
    `<svg class="${cls} flex-shrink-0" aria-hidden="true" data-ph="${name}" `
  )
}

module.exports = { phIcon }

if (require.main === module) {
  const [name, weight, cls] = process.argv.slice(2)
  if (!name) {
    console.error('Cách dùng: node scripts/ph-icon.cjs <tên> [regular|bold|fill|duotone] ["lớp css"]')
    process.exit(1)
  }
  console.log(phIcon(name, weight, cls))
}
