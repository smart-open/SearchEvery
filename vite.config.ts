import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    // React 插件（使用默认配置）。如需禁用 Fast Refresh，请根据所用插件版本文档配置。
    react()
  ],
  resolve: {
    alias: {
      // 强制统一引用到同一份 React，避免出现多份 React 导致 Invalid hook call
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
    },
    // 进一步确保依赖去重
    dedupe: ['react', 'react-dom']
  },
  server: {
    port: 5173
  }
})