import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        khoTab: resolve(__dirname, 'kho-tab.html'),
        congCu: resolve(__dirname, 'cong-cu.html'),
        metronome: resolve(__dirname, 'metronome.html'),
        cuaToi: resolve(__dirname, 'cua-toi.html'),
        adminLogin: resolve(__dirname, 'admin-login.html'),
        adminDashboard: resolve(__dirname, 'admin-dashboard.html'),
      }
    }
  }
})
