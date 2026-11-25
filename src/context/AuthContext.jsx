import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { emailForUsername } from '../data/load.js'

// Monthly figures are for the people who run the shop.
export const ALLOWED_ROLES = ['owner', 'manager']

const AuthContext = createContext(null)

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('id,full_name,username,role,is_active').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', session: null, profile: null })

  useEffect(() => {
    let alive = true
    // Dev only: npm run dev + ?fixture previews with local data and no sign-in. Compiled out of builds.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
      setState({ status: 'ready', session: null, profile: { full_name: 'Preview', role: 'owner', is_active: true } })
      return
    }
    const apply = async (session) => {
      if (!session) return alive && setState({ status: 'signed-out', session: null, profile: null })
      try {
        const profile = await loadProfile(session.user.id)
        if (!alive) return
        const allowed = profile?.is_active && ALLOWED_ROLES.includes(profile.role)
        setState({ status: allowed ? 'ready' : 'forbidden', session, profile })
      } catch {
        if (alive) setState({ status: 'error', session, profile: null })
      }
    }
    supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') apply(session)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = async (identifier, password) => {
    const email = await emailForUsername(identifier)
    if (!email) throw new Error('Wrong username or password.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.status === 400 ? 'Wrong username or password.' : 'Could not sign in. Try again.')
  }

  const signOut = () => supabase.auth.signOut()

  return <AuthContext.Provider value={{ ...state, signIn, signOut }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
