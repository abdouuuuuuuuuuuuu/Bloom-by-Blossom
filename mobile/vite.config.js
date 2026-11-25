import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Strict Content-Security-Policy in the built site only (Vite's dev server needs inline scripts).
// The page may talk to the shop's Supabase project and nothing else.
function csp(supabaseUrl) {
  const origin = supabaseUrl ? new URL(supabaseUrl).origin : 'https://*.supabase.co'
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${origin.replace('https://', 'wss://')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
  return {
    name: 'blossom-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (mode === 'production' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in .env, or in Netlify environment variables) before building.')
  }
  return {
    base: './',
    plugins: [react(), tailwindcss(), csp(env.VITE_SUPABASE_URL)],
    server: { port: 5190 },
    build: { target: 'es2022' },
  }
})
