/**
 * GUITAR BY QUANG — theme-config.js
 * Tailwind CSS custom configuration — dùng chung cho tất cả trang.
 * QUAN TRỌNG: Đây là script thường (KHÔNG phải ES module).
 * Phải load SAU <script src="cdn.tailwindcss.com"> và TRƯỚC khi DOM parse xong.
 * Nếu chuyển sang type="module" (deferred), Tailwind CDN sẽ scan class trước khi
 * nhận được config và các màu custom sẽ bị mất.
 */
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
        heading: ['Nunito', 'sans-serif'],
      },
      colors: {
        // Modern Artistic Acoustic Palette - ấm áp, mộc mạc, đậm chất gỗ
        canvas: '#FBF6EF',       // Nền ngà kem ấm
        headerBg: '#E4D3BF',     // Tông gỗ be ấm đậm đà cho Navigation
        surface: '#F1E6D9',      // Nền khối phụ
        surfaceAlt: '#E6D5C2',   // Nền nhấn border/input
        surfaceCard: '#FFFDF9',  // Nền thẻ card sáng
        charcoal: {
          DEFAULT: '#382C24',    // Nâu than cà phê đậm
          muted: '#7C6A5C',      // Nâu gỗ walnut
          faint: '#AC9C8D',      // Nâu nhạt
          border: '#E4D5C4',     // Viền mộc
        },
        terracotta: {
          DEFAULT: '#C1602F',    // Cam đất nung nghệ thuật
          hover: '#A34A21',
          light: '#F4DECB',
          border: '#E3BE9C',
        },
        ochre: {
          DEFAULT: '#CE9145',    // Hổ phách ấm
          light: '#F6E8D2',
        },
        sage: {
          DEFAULT: '#7E9885',
          hover: '#647A6C',
          light: '#E6EDE6',
          border: '#C7D6C9',
        },
        plum: {
          DEFAULT: '#8C6E8A',
          light: '#EFE5EE',
        }
      },
      boxShadow: {
        'soft': '0 8px 25px -8px rgba(56, 44, 36, 0.10)',
        'float': '0 16px 35px -12px rgba(56, 44, 36, 0.16)',
        'glow': '0 0 0 1px rgba(193, 96, 47, 0.08), 0 12px 30px -10px rgba(193, 96, 47, 0.25)',
      },
      backgroundImage: {
        'warm-gradient': 'linear-gradient(135deg, #C1602F 0%, #CE9145 100%)',
        'hero-glow': 'radial-gradient(circle at 30% 20%, rgba(206,145,69,0.16), transparent 55%), radial-gradient(circle at 80% 60%, rgba(126,152,133,0.14), transparent 50%)',
      }
    }
  }
}
