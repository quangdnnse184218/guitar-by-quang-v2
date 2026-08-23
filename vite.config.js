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
      }
    }
  }
})
