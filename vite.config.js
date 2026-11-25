import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Strict Content-Security-Policy, only in the built app (Vite's dev server needs inline scripts).
function csp(supabaseUrl) {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : 'https://*.supabase.co'
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${origin.replace('https://', 'wss://')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'bloom-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './', // the desktop app loads files from disk
    plugins: [react(), tailwindcss(), csp(env.VITE_SUPABASE_URL)],
    server: { port: 5180 },
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: { manualChunks: { charts: ['recharts'], supabase: ['@supabase/supabase-js'] } },
      },
    },
  }
})
