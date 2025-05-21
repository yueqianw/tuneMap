import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'; // 添加这行

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    // 添加代理，以便在开发时处理CORS问题
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});