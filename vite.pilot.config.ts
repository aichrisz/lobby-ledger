import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

// Private-hosted simple edition: the same local-first, no-account handover
// workflow as V1, kept separate from the public GitHub Pages artifact.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    outDir: 'dist-pilot',
    rollupOptions: { input: resolve(__dirname, 'pilot.html') },
  },
})
