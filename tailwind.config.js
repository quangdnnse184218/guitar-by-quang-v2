/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        'bg-base': 'var(--bg-base)',
        'blob-amber': 'var(--blob-amber)',
        'blob-violet': 'var(--blob-violet)',
        'blob-rose': 'var(--blob-rose)',
        'glass-bg': 'var(--glass-bg)',
        'glass-border': 'var(--glass-border)',
        'glass-bg-hover': 'var(--glass-bg-hover)',
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        'accent-primary': 'var(--accent-primary)',
        'accent-primary-hover': 'var(--accent-primary-hover)',
        'accent-secondary': 'var(--accent-secondary)',
        'success': 'var(--success)',
        'danger': 'var(--danger)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        heading: ['"Be Vietnam Pro"', 'sans-serif'],
        body: ['"Be Vietnam Pro"', 'Inter', 'sans-serif'],
      },
    },
  },
  safelist: [
    'aspect-[16/10]',
    'aspect-[4/3]',
    'aspect-square',
    'aspect-video',
    'from-[#C1602F]', 'to-[#6E3B1F]',
    'from-[#C4AC93]', 'to-[#6B5844]',
    'from-[#CBB79E]', 'to-[#7E9885]',
    'from-[#D9C3A0]', 'to-[#8C6E8A]',
    'from-[#C7B49C]',
    'from-[#D6BE9E]',
    'from-[#BFA88E]', 'to-[#5F4C3B]',
    'from-[#E0C9A6]', 'to-[#CE9145]',
    'from-[#C9AE92]',
    'from-[#D8C4AC]', 'to-[#647A6C]',
    'from-[#2D4A3E]', 'via-[#385E4F]', 'to-[#20362C]'
  ],
  plugins: [],
}

