import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../api/index.js'
import { STAFF_ROLES } from '../lib/permissions.js'

const Ctx = createContext(null)
const REFRESH_MS = 60_000

/** Hash routes: #/today, #/orders, #/orders/<id>, #/new, #/me */
function readRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  return { name: parts[0] || '', id: parts[1] || null, query: new URLSearchParams(query) }
}
export const navigate = (path, { replace = false } = {}) => {
  const url = `#/${path.replace(/^\//, '')}`
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export function AppProvider({ children }) {
  const [auth, setAuth] = useState({ status: 'loading', profile: null })
  const [route, setRoute] = useState(readRoute)
  const [orders, setOrders] = useState(null)
  const [products, setProducts] = useState(null)
  const [shop, setShop] = useState('Blossom')
  const [sync, setSync] = useState({ loading: false, error: null, at: null })
  const [toast, setToast] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const busy = useRef(false)

  // ── Auth ───────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      const profile = await api.currentProfile()
      if (!profile) return setAuth({ status: 'signed-out', profile: null })
      const ok = profile.is_active && STAFF_ROLES.includes(profile.role)
      setAuth({ status: ok ? 'ready' : 'blocked', profile })
    } catch {
      setAuth({ status: 'error', profile: null })
    }
  }, [])
  useEffect(() => { loadProfile(); return api.onAuthChange(loadProfile) }, [loadProfile])

  // ── Data ───────────────────────────────────────────────────
  const refresh = useCallback(async ({ products: withProducts = false } = {}) => {
    if (busy.current) return
    busy.current = true
    setSync((s) => ({ ...s, loading: true, error: null }))
    try {
      const [o, p] = await Promise.all([api.loadOrders(), withProducts ? api.loadProducts() : null])
      setOrders(o)
      if (p) setProducts(p)
      setSync({ loading: false, error: null, at: new Date() })
    } catch (err) {
      setSync((s) => ({ ...s, loading: false, error: err.message || 'Could not refresh.' }))
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    if (auth.status !== 'ready') return undefined
    refresh({ products: true })
    api.shopName().then(setShop).catch(() => {})
    const tick = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', onVisible) }
  }, [auth.status, refresh])

  /** After an action: fetch that one order again and put it in the list. */
  const reloadOrder = useCallback(async (id) => {
    const fresh = await api.loadOrder(id)
    if (!fresh) return null
    setOrders((list) => {
      const rest = (list || []).filter((o) => o.id !== id)
      return [fresh, ...rest]
    })
    return fresh
  }, [])

  // ── Route, network, toasts ─────────────────────────────────
  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onHash)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onHash) }
  }, [])
  useEffect(() => {
    const on = () => { setOnline(true); refresh() }
    const off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [refresh])

  const notify = useCallback((text, tone = 'good') => {
    setToast({ text, tone, key: Date.now() })
  }, [])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const value = {
    auth, role: auth.profile?.role, profile: auth.profile, shop, route, orders, products, sync, refresh, reloadOrder,
    toast, notify, online, signOut: api.signOut,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(Ctx)
