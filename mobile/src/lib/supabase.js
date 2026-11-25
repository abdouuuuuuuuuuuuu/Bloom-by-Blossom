import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const demo = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo')

if (!demo && (!url || !anonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.')
}

// Same Supabase project and accounts as Blossom POS. The phone keeps you
// signed in (like any phone app) until you sign out from the Me tab.
export const supabase = demo ? null : createClient(url, anonKey, {
  auth: { storageKey: 'blossom-mobile-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: {
    fetch: (input, init = {}) => {
      const timeout = AbortSignal.timeout(20_000)
      const signal = init.signal && AbortSignal.any ? AbortSignal.any([init.signal, timeout]) : init.signal || timeout
      return fetch(input, { ...init, signal })
    },
  },
})
