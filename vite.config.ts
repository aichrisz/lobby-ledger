/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    environment: 'happy-dom',
    globals: true,
    maxWorkers: 2,
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
  },
})
