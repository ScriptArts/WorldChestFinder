import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// spring-nbt-library は ESM 専用のため、CommonJS の main バンドルへ取り込む
const bundledDependencies = ['spring-nbt-library']

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: bundledDependencies })] },
  preload: { plugins: [externalizeDepsPlugin({ exclude: bundledDependencies })] },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
