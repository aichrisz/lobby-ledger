import { defineConfig, loadEnv, type Plugin } from 'vite'
import preact from '@preact/preset-vite'
import { resolve } from 'node:path'

function pilotCsp(supabaseUrl: string): Plugin {
  return {
    name: 'pilot-csp',
    transformIndexHtml(html) {
      return html.replace('%SUPABASE_ORIGIN%', new URL(supabaseUrl).origin)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const url = env.VITE_SUPABASE_URL
  if (!url || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Pilot build requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example)')
  }
  return {
    base: './',
    plugins: [preact(), pilotCsp(url)],
    build: {
      outDir: 'dist-pilot',
      rollupOptions: { input: resolve(__dirname, 'pilot.html') },
    },
  }
})
