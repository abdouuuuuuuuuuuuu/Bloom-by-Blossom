import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { loadAll } from '../data/load.js'
import { buildDataset } from '../model/dataset.js'
import { buildBackOffice } from '../model/backoffice.js'
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
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [toast, setToast] = useState(null)
  const [status, setStatus] = useState({ loading: true, error: null, loadedAt: null })
  const [prefs, setPrefs] = usePrefs()
  const [period, setPeriod] = useState(() => makePeriod('month'))
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(() => (import.meta.env.DEV && new URLSearchParams(location.search).get('page')) || 'overview')
  const [drawers, setDrawers] = useState([])
  const inFlight = useRef(null)

  /** Reload everything. Concurrent calls share one load; force waits for it and loads again. */
  const refresh = useCallback(async ({ force = false } = {}) => {
    if (inFlight.current) {
      if (!force) return inFlight.current
      await inFlight.current.catch(() => {})
    }
    const run = (async () => {
      setStatus((s) => ({ ...s, loading: true, error: null }))
      try {
        const { raw: next, restricted: blocked, setupNeeded: needsSetup } = await loadAll()
        setRaw(next)
        setRestricted(blocked)
        setSetupNeeded(!!needsSetup)
        setStatus({ loading: false, error: null, loadedAt: new Date() })
      } catch (err) {
        setStatus((s) => ({ ...s, loading: false, error: err?.message || 'Could not load data.' }))
      }
    })()
    inFlight.current = run
    try { await run } finally { if (inFlight.current === run) inFlight.current = null }
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
  const bo = useMemo(() => (raw && ds ? buildBackOffice(raw, ds) : null), [raw, ds])

  /** Short confirmation at the bottom of the window. */
  const notify = useCallback((text, tone = 'sage') => {
    const id = Date.now()
    setToast({ id, text, tone })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 4000)
  }, [])

  /** After a write: say so, then reload so every page shows the new numbers. */
  const saved = useCallback(async (text) => {
    notify(text)
    await refresh({ force: true })
  }, [notify, refresh])
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
    ds, bo, rawData: raw, sel, prevSel, setupNeeded, toast, notify, saved, period, prev, setPeriod, filters, setFilter, patchFilters, clearFilters: () => setFilters({}),
    page, go, drawers, open, back, closeAll,
    prefs, setPrefs, dailyTarget, restricted, status, refresh,
  }
  return <AppState.Provider value={value}>{children}</AppState.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(AppState)
