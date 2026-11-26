import { useEffect } from 'react'
import {
  LayoutDashboard, TrendingUp, Flower2, Users, Wallet, Truck, Boxes, ReceiptText, Settings, LogOut,
  RefreshCw, Printer, ShoppingBasket, Calculator, IdCard, ChevronLeft, ChevronRight, FilterX, AlertTriangle,
} from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { BloomMark } from './BloomMark.jsx'
import { Chip, Segmented } from './ui.jsx'
import { filterChips } from '../model/filters.js'
import { makePeriod, weekEnding } from '../model/period.js'
import { currentMonth, isDayKey, isMonthKey, shiftMonth, today, addDays } from '../lib/time.js'

export const PAGES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Sales', icon: TrendingUp },
  { id: 'products', label: 'Products', icon: Flower2 },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'money', label: 'Money', icon: Wallet },
  { id: 'operations', label: 'Operations', icon: Truck },
  { id: 'orders', label: 'Orders', icon: ReceiptText },
  { id: 'purchasing', label: 'Purchasing', icon: ShoppingBasket, group: 'office' },
  { id: 'stock', label: 'Inventory', icon: Boxes, group: 'office' },
  { id: 'accounting', label: 'Accounting', icon: Calculator, group: 'office' },
  { id: 'staff', label: 'Staff & payroll', icon: IdCard, group: 'office' },
]

const isDesktop = typeof window !== 'undefined' && !!window.bloomDesktop

export function Shell({ children }) {
  const { page, go, status, refresh } = useApp()
  const { profile, signOut } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r border-line/70 bg-paper/70 backdrop-blur-xl">
        <div className="drag flex h-14 items-center gap-2.5 px-5">
          <BloomMark className="h-7 w-7" />
          <span className="font-display text-xl text-plum">Bloom</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Pages">
          {PAGES.map(({ id, label, icon: Icon, group }, i) => (
            <div key={id}>
            {(i === 0 || group !== PAGES[i - 1].group) && <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted/80 first:pt-1">{group === 'office' ? 'Back office' : 'Reports'}</p>}
            <button onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${page === id ? 'bg-plum text-white shadow-md shadow-plum/20' : 'text-muted hover:bg-plum-soft/60 hover:text-ink'}`}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
            </div>
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-line/70 px-3 py-3">
          <button onClick={() => go('settings')} aria-current={page === 'settings' ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${page === 'settings' ? 'bg-plum text-white' : 'text-muted hover:bg-plum-soft/60 hover:text-ink'}`}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Settings
          </button>
          <div className="flex items-center justify-between gap-2 px-3 pt-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{profile?.full_name}</p>
              <p className="text-[11px] capitalize text-muted">{profile?.role}{status.loadedAt && ` · ${status.loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}</p>
            </div>
            <button onClick={signOut} aria-label="Sign out" title="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-rose"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onRefresh={refresh} loading={status.loading} />
        <main className="flex-1 overflow-y-auto">
          {status.error && (
            <div role="alert" className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-2xl border border-rose/30 bg-rose-soft/60 p-3 text-sm text-rose">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Could not refresh: {status.error}</span>
              <button onClick={refresh} className="rounded-lg bg-paper px-3 py-1.5 font-medium">Try again</button>
            </div>
          )}
          <div className="mx-auto max-w-[1400px] px-6 pb-16 pt-5">{children}</div>
        </main>
      </div>
    </div>
  )
}

function TopBar({ onRefresh, loading }) {
  const { ds, filters, setFilter, clearFilters } = useApp()
  const chips = ds ? filterChips(filters, ds) : []
  return (
    <header className={`no-print drag sticky top-0 z-20 border-b border-line/70 bg-cream/85 backdrop-blur-xl ${isDesktop ? 'pr-[150px]' : ''}`}>
      <div className="flex min-h-14 flex-wrap items-center gap-3 px-6 py-2">
        <PeriodPicker />
        {chips.length > 0 && (
          <div className="no-drag flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Showing only</span>
            {chips.map((c) => <Chip key={c.key} onRemove={() => setFilter(c.key, null)}><span className="opacity-70">{c.name}:</span> {c.text}</Chip>)}
            {chips.length > 1 && <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-muted hover:text-rose"><FilterX className="h-3.5 w-3.5" /> Clear all</button>}
          </div>
        )}
        <div className="no-drag ml-auto flex items-center gap-1">
          <IconButton label="Refresh data" onClick={onRefresh} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></IconButton>
          <IconButton label="Print or save as PDF" onClick={() => window.print()}><Printer className="h-4 w-4" /></IconButton>
        </div>
      </div>
    </header>
  )
}

export function IconButton({ label, children, ...props }) {
  return (
    <button {...props} title={label} aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-paper hover:text-plum hover:shadow-sm disabled:opacity-40">
      {children}
    </button>
  )
}

function PeriodPicker() {
  const { period, setPeriod } = useApp()
  const thisMonth = currentMonth()
  const thisYear = today().slice(0, 4)

  // Keyboard: Alt+← / Alt+→ steps the period.
  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
      const step = e.key === 'ArrowLeft' ? -1 : 1
      if (period.kind === 'week') {
        const next = addDays(period.value, step * 7)
        if (next <= weekEnding(today())) setPeriod(makePeriod('week', next))
      } else if (period.kind === 'month') {
        const next = shiftMonth(period.value, step)
        if (next <= thisMonth) setPeriod(makePeriod('month', next))
      } else if (period.kind === 'year') {
        const next = String(Number(period.value) + step)
        if (next <= thisYear) setPeriod(makePeriod('year', next))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [period, setPeriod, thisMonth, thisYear])

  const kind = period.kind
  const setKind = (k) => {
    if (k === 'week') setPeriod(makePeriod('week'))
    else if (k === 'month') setPeriod(makePeriod('month', thisMonth))
    else if (k === 'year') setPeriod(makePeriod('year', thisYear))
    else if (k === 'range') setPeriod(makePeriod('range', [addDays(today(), -13), today()]))
    else setPeriod(makePeriod(k))
  }

  const stepper = (label, prev, next, canNext, input) => (
    <div className="flex items-center gap-0.5 rounded-xl border border-line bg-paper p-0.5 shadow-sm">
      <button onClick={prev} aria-label="Previous" title="Previous (Alt+←)" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><ChevronLeft className="h-4 w-4" /></button>
      <label className="relative flex h-8 min-w-36 items-center justify-center rounded-lg px-3 font-display text-[15px] text-ink hover:bg-plum-soft/50">
        {label}{input}
      </label>
      <button onClick={next} disabled={!canNext} aria-label="Next" title="Next (Alt+→)" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
    </div>
  )

  return (
    <div className="no-drag flex flex-wrap items-center gap-2">
      <Segmented label="Period" value={kind} onChange={setKind}
        options={[['week', 'Week'], ['month', 'Month'], ['year', 'Year'], ['last30', '30 days'], ['last90', '90 days'], ['range', 'Custom']]} />
      {kind === 'week' && stepper(period.label,
        () => setPeriod(makePeriod('week', addDays(period.value, -7))),
        () => setPeriod(makePeriod('week', addDays(period.value, 7))),
        period.value < weekEnding(today()),
        <input type="date" value={period.value} max={weekEnding(today())} aria-label="Pick a day in the week" className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => isDayKey(e.target.value) && setPeriod(makePeriod('week', weekEnding(e.target.value)))} />)}
      {kind === 'month' && stepper(period.label,
        () => setPeriod(makePeriod('month', shiftMonth(period.value, -1))),
        () => setPeriod(makePeriod('month', shiftMonth(period.value, 1))),
        period.value < thisMonth,
        <input type="month" value={period.value} max={thisMonth} aria-label="Pick a month" className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => isMonthKey(e.target.value) && setPeriod(makePeriod('month', e.target.value))} />)}
      {kind === 'year' && stepper(period.label,
        () => setPeriod(makePeriod('year', String(Number(period.value) - 1))),
        () => setPeriod(makePeriod('year', String(Number(period.value) + 1))),
        period.value < thisYear)}
      {kind === 'range' && (
        <div className="flex items-center gap-1.5 rounded-xl border border-line bg-paper px-2 py-1 text-sm shadow-sm">
          <input type="date" value={period.start} max={period.end} aria-label="From" className="bg-transparent outline-none"
            onChange={(e) => isDayKey(e.target.value) && setPeriod(makePeriod('range', [e.target.value, period.end]))} />
          <span className="text-muted">→</span>
          <input type="date" value={period.end} min={period.start} max={today()} aria-label="To" className="bg-transparent outline-none"
            onChange={(e) => isDayKey(e.target.value) && setPeriod(makePeriod('range', [period.start, e.target.value]))} />
        </div>
      )}
      {(kind === 'last30' || kind === 'last90') && <span className="font-display text-[15px] text-ink">{period.label}</span>}
    </div>
  )
}

/** Page title row. */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="rise mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[34px] leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}
