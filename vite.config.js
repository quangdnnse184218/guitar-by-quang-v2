import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        khoTab: resolve(import.meta.dirname, 'kho-tab.html'),
        congCu: resolve(import.meta.dirname, 'cong-cu.html'),
        metronome: resolve(import.meta.dirname, 'metronome.html'),
        cuaToi: resolve(import.meta.dirname, 'cua-toi.html'),
        adminLogin: resolve(import.meta.dirname, 'admin-login.html'),
        adminDashboard: resolve(import.meta.dirname, 'admin-dashboard.html'),
        register: resolve(import.meta.dirname, 'register.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        userDashboard: resolve(import.meta.dirname, 'user-dashboard.html'),
        resetPassword: resolve(import.meta.dirname, 'reset-password.html'),
        adminResetPassword: resolve(import.meta.dirname, 'admin-reset-password.html'),
      }
    }
  }
})
