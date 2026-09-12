import js from '@eslint/js'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Codebase gán hàm/biến vào window (window.foo = ...) rồi gọi qua tên
      // trần ở chỗ khác (kể cả từ onclick= trong HTML), điều này chạy đúng
      // trong browser vì window là global scope object, nhưng ESLint không
      // theo dõi được kiểu gán động này nên báo false-positive "not defined".
      // Hạ xuống warn thay vì tắt hẳn để vẫn bắt được lỗi gõ sai tên thật sự.
      'no-undef': 'warn',
      'no-useless-assignment': 'warn',
      'no-empty': 'warn',
    },
  },
  {
    files: ['scripts/**/*.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  prettierConfig,
  {
    // .claude/skills — script cài kèm skill bên thứ ba (ui-ux-pro-max), không
    // phải code của project nên không lint theo config này.
    ignores: ['dist/**', 'node_modules/**', '.claude/**'],
  },
]
