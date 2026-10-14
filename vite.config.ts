import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base './' : dist/ 를 어느 하위 경로에 올려도 동작 (hash 라우팅 사용)
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
