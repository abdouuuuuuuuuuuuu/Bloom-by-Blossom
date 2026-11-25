import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadAll } from '../data/load.js'
import { buildDataset } from '../model/dataset.js'
import { makePeriod, comparablePrevious } from '../model/period.js'
import { select } from '../model/filters.js'
import { usePrefs } from './prefs.js'

const AppState = createContext(null)
const STALE_MS = 5 * 60 * 1000

/**
 * Holds everything the pages share: the dataset, the chosen period,
 * cross-filters, the open page and the detail drawer stack.
 */
export function AppStateProvider({ children }) {
  const [raw, setRaw] = useState(null)
  const [restricted, setRestricted] = useState([])
  const [status, setStatus] = useState({ loading: true, error: null, loadedAt: null })
  const [prefs, setPrefs] = usePrefs()
  const [period, setPeriod] = useState(() => makePeriod('month'))
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(() => (import.meta.env.DEV && new URLSearchParams(location.search).get('page')) || 'overview')
  const [drawers, setDrawers] = useState([])
  const loading = useRef(false)

  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setStatus((s) => ({ ...s, loading: true, error: null }))
    try {
      const { raw: next, restricted: blocked } = await loadAll()
      setRaw(next)
      setRestricted(blocked)
      setStatus({ loading: false, error: null, loadedAt: new Date() })
    } catch (err) {
      setStatus((s) => ({ ...s, loading: false, error: err?.message || 'Could not load data.' }))
    } finally {
      loading.current = false
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Fresh numbers when you come back to Bloom after a while.
  useEffect(() => {
    const onFocus = () => {
      if (status.loadedAt && Date.now() - status.loadedAt.getTime() > STALE_MS) refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, status.loadedAt])

  const ds = useMemo(() => (raw ? buildDataset(raw, prefs) : null), [raw, prefs])
  const dailyTarget = prefs.dailyTarget ?? ds?.dailyTarget ?? 0
  const prev = useMemo(() => comparablePrevious(period), [period])
  const sel = useMemo(() => (ds ? select(ds, period, filters) : null), [ds, period, filters])
  const prevSel = useMemo(() => (ds ? select(ds, prev, filters) : null), [ds, prev, filters])

  const setFilter = useCallback((key, value) => {
    setFilters((f) => {
      const next = { ...f }
      if (value == null || value === '' || String(f[key]) === String(value)) delete next[key]
      else next[key] = value
      return next
    })
  }, [])

  /** Set several filters at once; a null value removes that filter. */
  const patchFilters = useCallback((patch) => {
    setFilters((f) => {
      const next = { ...f }
      for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') delete next[k]; else next[k] = v }
      return next
    })
  }, [])

  const go = useCallback((target, extraFilters) => {
    setPage(target)
    if (extraFilters) setFilters((f) => ({ ...f, ...extraFilters }))
    setDrawers([])
    document.querySelector('main')?.scrollTo?.({ top: 0 })
  }, [])

  const open = useCallback((kind, id) => setDrawers((d) => [...d, { kind, id, key: `${kind}:${id}:${d.length}` }]), [])
  const back = useCallback(() => setDrawers((d) => d.slice(0, -1)), [])
  const closeAll = useCallback(() => setDrawers([]), [])

  const value = {
    ds, sel, prevSel, period, prev, setPeriod, filters, setFilter, patchFilters, clearFilters: () => setFilters({}),
    page, go, drawers, open, back, closeAll,
    prefs, setPrefs, dailyTarget, restricted, status, refresh,
  }
  return <AppState.Provider value={value}>{children}</AppState.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppState)
