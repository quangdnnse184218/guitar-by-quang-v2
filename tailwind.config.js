/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Token dưới dạng `rgb(var(--x) / <alpha-value>)` + biến CSS lưu "R G B"
        // (không phải hex) — bắt buộc phải vậy thì Tailwind mới sinh được các
        // utility có modifier độ mờ như `bg-accent-primary/20`. Xem ghi chú
        // 2026-09-26 ở đầu style.css để biết lý do và phạm vi đã sửa.
        'bg-base': 'rgb(var(--bg-base) / <alpha-value>)',
        // blob-amber/violet/rose: token cũ không còn nơi nào dùng tới (đã dò),
        // giữ lại nguyên hex phẳng cho an toàn, không cần opacity.
        'blob-amber': 'var(--blob-amber)',
        'blob-violet': 'var(--blob-violet)',
        'blob-rose': 'var(--blob-rose)',
        'glass-bg': 'rgb(var(--glass-bg) / <alpha-value>)',
        // glass-border CỐ Ý giữ nguyên dạng cũ — xem ghi chú trong style.css.
        'glass-border': 'var(--glass-border)',
        'glass-bg-hover': 'rgb(var(--glass-bg-hover) / <alpha-value>)',
        'text-primary': 'rgb(var(--text-primary) / <alpha-value>)',
        'text-muted': 'rgb(var(--text-muted) / <alpha-value>)',
        'text-faint': 'rgb(var(--text-faint) / <alpha-value>)',
        'accent-primary': 'rgb(var(--accent-primary) / <alpha-value>)',
        'accent-primary-hover': 'rgb(var(--accent-primary-hover) / <alpha-value>)',
        'accent-secondary': 'rgb(var(--accent-secondary) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        heading: ['"Be Vietnam Pro"', 'sans-serif'],
        body: ['"Be Vietnam Pro"', 'Inter', 'sans-serif'],
        // Chữ tiêu đề lớn (h1 / .text-h1 đã tự áp trong style.css) — thêm class
        // font-display để dùng cho những chữ lớn khác không phải thẻ h1 thật.
        display: ['"Fraunces"', 'serif'],
      },
    },
  },
  safelist: [
    'aspect-[16/10]',
    'aspect-[4/3]',
    'aspect-square',
    'aspect-video',
    'from-[#C1602F]',
    'to-[#6E3B1F]',
    'from-[#C4AC93]',
    'to-[#6B5844]',
    'from-[#CBB79E]',
    'to-[#7E9885]',
    'from-[#D9C3A0]',
    'to-[#8C6E8A]',
    'from-[#C7B49C]',
    'from-[#D6BE9E]',
    'from-[#BFA88E]',
    'to-[#5F4C3B]',
    'from-[#E0C9A6]',
    'to-[#CE9145]',
    'from-[#C9AE92]',
    'from-[#D8C4AC]',
    'to-[#647A6C]',
    'from-[#2D4A3E]',
    'via-[#385E4F]',
    'to-[#20362C]',
  ],
  plugins: [],
}
