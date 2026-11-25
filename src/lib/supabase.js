import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.')
}

// Same Supabase project and accounts as Blossom POS. Bloom keeps its own
// session (storageKey) so signing out here never signs the till out.
export const supabase = createClient(url, anonKey, {
  auth: { storageKey: 'bloom-auth', persistSession: true, autoRefreshToken: true },
})
