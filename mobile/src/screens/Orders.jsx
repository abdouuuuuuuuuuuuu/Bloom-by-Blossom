import { useMemo, useState } from 'react'
import { ClipboardList, RefreshCw, Search, X } from 'lucide-react'
import { useApp } from '../state/app.jsx'
import { Screen, Empty, Skeleton } from '../components/ui.jsx'
import { OrderCard } from '../components/OrderCard.jsx'
import { byDue, byNewest, dueDay, isCancelled, isDelivery, isOpen, isQuick, matches, owes, stage } from '../lib/orders.js'
import { relativeDay, today, dayKey } from '../lib/time.js'
import { num } from '../lib/format.js'

const FILTERS = [
  { id: 'open', label: 'To do' },
  { id: 'delivery', label: 'Deliveries' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
]

export default function Orders() {
  const { orders, route, role, sync, refresh } = useApp()
  const [filter, setFilter] = useState(() => route.query.get('f') || (role === 'delivery' ? 'delivery' : 'open'))
  const [q, setQ] = useState('')

  const { groups, counts } = useMemo(() => {
    const list = orders || []
    const sets = {
      open: list.filter(isOpen).sort(byDue),
      delivery: list.filter((o) => isDelivery(o) && !isCancelled(o) && !['delivered', 'done'].includes(stage(o).key)).sort(byDue),
      unpaid: list.filter(owes).sort(byNewest),
      done: list.filter((o) => !isOpen(o) && !isCancelled(o)).sort(byNewest),
      all: [...list].sort(byNewest),
    }
    const chosen = sets[filter].filter((o) => matches(o, q))
    // Open work is grouped by the day it is due; history by the day it was taken.
    const keyOf = filter === 'open' || filter === 'delivery' ? dueDay : (o) => dayKey(o.created_at)
    const map = new Map()
    for (const o of chosen) {
      const k = keyOf(o)
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(o)
    }
    return { groups: [...map.entries()], counts: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.length])) }
  }, [orders, filter, q])

  const t = today()
  return (
    <Screen title="Orders" subtitle={sync.at ? `Updated ${sync.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
      actions={<button onClick={() => refresh()} aria-label="Refresh" className="grid h-10 w-10 place-items-center rounded-full text-plum active:bg-plum-soft"><RefreshCw className={`h-5 w-5 ${sync.loading ? 'animate-spin' : ''}`} /></button>}>
      <label className="relative mb-3 block">
        <span className="sr-only">Search orders</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Name, phone, order #, flower…"
          className="h-12 w-full rounded-2xl border border-line bg-paper pl-12 pr-11 text-ink outline-none focus:border-plum focus:ring-4 focus:ring-plum/10" />
        {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted"><X className="h-4 w-4" /></button>}
      </label>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${filter === f.id ? 'bg-plum text-white shadow-md shadow-plum/20' : 'bg-paper text-muted ring-1 ring-line'}`}>
            {f.label} <span className="tabular opacity-70">{num(counts[f.id] || 0)}</span>
          </button>
        ))}
      </div>

      {!orders ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : groups.length === 0 ? (
        <Empty icon={ClipboardList} title={q ? 'No match' : 'Nothing here'}>{q ? `No order matches “${q}”.` : filter === 'open' ? 'Every order is done. Nice work.' : 'No orders in this list.'}</Empty>
      ) : (
        groups.map(([day, list]) => (
          <section key={day} className="mb-5">
            <h2 className={`mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide ${day < t && (filter === 'open' || filter === 'delivery') ? 'text-rose' : 'text-muted'}`}>
              {relativeDay(day)} <span className="font-normal normal-case tracking-normal">· {list.length} {list.length === 1 ? 'order' : 'orders'}{list.some(isQuick) && list.every(isQuick) ? ' (counter)' : ''}</span>
            </h2>
            <ul className="space-y-3">{list.map((o) => <li key={o.id}><OrderCard order={o} showDay={false} /></li>)}</ul>
          </section>
        ))
      )}
    </Screen>
  )
}
