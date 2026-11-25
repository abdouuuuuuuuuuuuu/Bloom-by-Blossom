// Owner preferences, kept on this computer only (never written to Supabase).
import { useCallback, useState } from 'react'

const KEY = 'bloom.prefs.v1'

export const DEFAULT_PREFS = {
  dailyTarget: null,        // null = use the daily target set in Blossom settings
  coverDays: 14,            // how many days of stock a reorder should cover
  costOverrides: {},        // productId -> unit cost (DA) for items with no supplier purchase
}

function read() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULT_PREFS } }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(read)
  const update = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage full or blocked */ }
      return next
    })
  }, [])
  return [prefs, update]
}
