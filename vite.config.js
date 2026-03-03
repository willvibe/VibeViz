import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile() // 核心：将 JS 和 CSS 全部内联到 HTML 中
  ],
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      },
      // 🔥 终极救命配置：强制 Terser 仅输出纯 ASCII 码！
      // 彻底阻断单文件打包和 inline Worker 下的 atob() UTF-8 解码崩溃！
      format: {
        ascii_only: true
      }
    },
    // 单文件模式必须清空 manualChunks
    rollupOptions: {}
  },
})