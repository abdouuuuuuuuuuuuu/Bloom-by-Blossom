import { useEffect, useMemo } from 'react'
import { ArrowLeft, Filter, Flower2, Phone, X, AlertTriangle } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { Bars } from './Charts.jsx'
import { BarList, Pill, Stat, Meter } from './ui.jsx'
import { DataTable } from './DataTable.jsx'
import { da, num, plural, ratio, num1 } from '../lib/format.js'
import { dayLabel, formatDateTime, formatTime, monthShort, WEEKDAYS, daysBetween, today, eachMonth, shiftMonth } from '../lib/time.js'
import { CHANNEL_LABELS, DELIVERY_LABELS, PAYMENT_LABELS, PAY_STATUS_LABELS, STATUS_LABELS, label } from '../lib/labels.js'
import { customerProfiles, SEGMENTS, hours as hoursOf } from '../model/metrics.js'
import { inPeriod } from '../model/period.js'

export function DrawerHost() {
  const { drawers, back, closeAll } = useApp()
  const top = drawers.at(-1)

  useEffect(() => {
    if (!top) return
    const onKey = (e) => { if (e.key === 'Escape') back() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [top, back])

  if (!top) return null
  const Body = { product: ProductDrawer, customer: CustomerDrawer, order: OrderDrawer, day: DayDrawer, staff: StaffDrawer }[top.kind]
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close details" onClick={closeAll} className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" style={{ animation: 'fade 200ms ease both' }} />
      <aside role="dialog" aria-modal="true" key={top.key}
        className="relative flex h-full w-full max-w-[620px] flex-col overflow-hidden border-l border-line bg-cream shadow-2xl" style={{ animation: 'slide-in 320ms cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="flex items-center gap-1 border-b border-line/70 bg-paper/80 px-3 py-2">
          {drawers.length > 1 && <button onClick={back} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-muted hover:bg-plum-soft hover:text-plum"><ArrowLeft className="h-4 w-4" /> Back</button>}
          <button onClick={closeAll} aria-label="Close" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{Body ? <Body id={top.id} /> : null}</div>
      </aside>
    </div>
  )
}

function Head({ kicker, title, sub, image, children }) {
  return (
    <div className="mb-5 flex items-start gap-4">
      {image !== undefined && (image
        ? <img src={image} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
        : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-rose-soft text-rose"><Flower2 className="h-7 w-7" /></span>)}
      <div className="min-w-0 flex-1">
        {kicker && <p className="text-xs font-medium text-rose">{kicker}</p>}
        <h2 className="font-display text-[26px] leading-tight text-ink">{title}</h2>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
        {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  )
}

function FilterButton({ filterKey, value, text }) {
  const { setFilter, closeAll, filters } = useApp()
  const on = String(filters[filterKey]) === String(value)
  return (
    <button onClick={() => { setFilter(filterKey, value); closeAll() }}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${on ? 'bg-plum text-white' : 'bg-plum-soft text-plum hover:bg-plum hover:text-white'}`}>
      <Filter className="h-3.5 w-3.5" /> {on ? 'Remove filter' : text}
    </button>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

const orderColumns = () => [
  { key: 'number', label: 'Order', sort: (o) => o.at, render: (o) => <><p className="font-medium">#{o.number}</p><p className="text-xs text-muted">{formatDateTime(o.at)}</p></> },
  { key: 'client', label: 'Customer', sort: (o) => o.clientName, render: (o) => <span className="truncate">{o.clientName || 'Walk-in'}</span> },
  { key: 'value', label: 'Total', align: 'right', render: (o) => <>{da(o.value)}{!o.counted && <p className="text-[11px] text-rose">cancelled</p>}</> },
]

function monthsBack(ds, n = 12) {
  const end = today().slice(0, 7)
  return eachMonth(shiftMonth(end, -(n - 1)), end)
}

// ── Product ───────────────────────────────────────────────────
function ProductDrawer({ id }) {
  const { ds, period, open } = useApp()
  const product = ds.products.get(id) || ds.products.get(Number(id))
  const data = useMemo(() => {
    if (!product) return null
    const all = ds.items.filter((i) => i.productId === product.id && i.order.counted)
    const inP = all.filter((i) => inPeriod(i.order.day, period))
    const qty = inP.reduce((s, i) => s + i.qty, 0)
    const revenue = inP.reduce((s, i) => s + i.value, 0)
    const months = monthsBack(ds).map((m) => {
      const list = all.filter((i) => i.order.month === m)
      return { key: m, label: monthShort(m), title: `${monthShort(m)} ${m.slice(0, 4)}`, qty: list.reduce((s, i) => s + i.qty, 0), revenue: list.reduce((s, i) => s + i.value, 0) }
    })
    const wd = WEEKDAYS.map((d, i) => ({ key: i, label: d, qty: inP.filter((x) => x.order.weekday === i).reduce((s, x) => s + x.qty, 0) }))
    const buyers = new Map()
    for (const i of inP) {
      if (i.order.customer === 'walk-in') continue
      const b = buyers.get(i.order.customer) || { key: i.order.customer, label: i.order.clientName || 'Customer', qty: 0, revenue: 0 }
      b.qty += i.qty; b.revenue += i.value
      buyers.set(i.order.customer, b)
    }
    const together = new Map()
    const orderIds = new Set(inP.map((i) => i.order.id))
    for (const o of ds.orders) {
      if (!orderIds.has(o.id)) continue
      for (const i of o.items) {
        if (i.productId === product.id) continue
        const t = together.get(i.productId) || { key: i.productId, label: i.name, revenue: 0, orders: 0 }
        t.orders += 1
        together.set(i.productId, t)
      }
    }
    const walkIn = inP.filter((i) => i.order.customer === 'walk-in').reduce((s, i) => s + i.qty, 0)
    return { qty, revenue, orders: orderIds.size, months, wd, walkIn, buyers: [...buyers.values()].sort((a, b) => b.revenue - a.revenue), together: [...together.values()].sort((a, b) => b.orders - a.orders).slice(0, 8), avgPrice: qty ? revenue / qty : 0 }
  }, [ds, product, period])
  if (!product || !data) return <p className="text-sm text-muted">This product is no longer in the catalogue.</p>

  const profit = product.cost == null ? null : data.revenue - product.cost * data.qty
  const margin = product.cost == null || !data.avgPrice ? null : (data.avgPrice - product.cost) / data.avgPrice
  return (
    <>
      <Head kicker={product.category + (product.flower ? ` · ${product.flower}` : '')} title={product.name} image={product.image}
        sub={<>List price {da(product.listPrice)} · {product.cost == null ? 'cost unknown' : `costs ${da(product.cost)} ${product.costSource === 'manual' ? '(set by you)' : '(avg purchase)'}`}</>}>
        {typeof product.id === 'number' && <FilterButton filterKey="product" value={product.id} text="Show only this product everywhere" />}
        {!product.active && <Pill tone="muted">Inactive</Pill>}
      </Head>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`Sold · ${period.short}`} value={num(data.qty)}>{plural(data.orders, 'order')}</Stat>
        <Stat label="Sales value" value={da(data.revenue)}>avg {da(data.avgPrice)} each</Stat>
        <Stat label="Profit" value={profit == null ? '—' : da(profit)} tone="sage">{margin == null ? 'add a cost in Settings' : `${ratio(margin)} margin`}</Stat>
        <Stat label="Stock" value={product.stockTracked ? num(product.stock) : '—'} tone={product.stock < 0 ? 'rose' : 'amber'}>{product.stockTracked ? (product.stock < 0 ? 'below zero, recount' : 'in stock') : 'not tracked'}</Stat>
      </div>
      <Section title="Sold per month (units)"><Bars data={data.months} measure="qty" height={170} /></Section>
      <Section title={`Which day it sells · ${period.short}`}><Bars data={data.wd} measure="qty" height={130} /></Section>
      <Section title="Who buys it">
        <BarList rows={data.buyers} limit={6} onSelect={(k) => open('customer', k)} extra={(r) => `${num(r.qty)} units`} empty="Only walk-in customers bought it in this period." />
        {data.walkIn > 0 && <p className="mt-2 text-xs text-muted">Plus {num(data.walkIn)} units to walk-in customers.</p>}
      </Section>
      <Section title="Often bought with it">
        <BarList rows={data.together} valueKey="orders" format={(v) => plural(v, 'order')} onSelect={(k) => open('product', k)} empty="Usually bought on its own." />
      </Section>
      {product.purchases.length > 0 && (
        <Section title="Bought from suppliers">
          <DataTable dense pageSize={8} rows={[...product.purchases].reverse().map((p) => ({ ...p, key: p.id }))} columns={[
            { key: 'day', label: 'Date', render: (p) => dayLabel(p.day, { day: 'numeric', month: 'short', year: '2-digit' }) },
            { key: 'supplier', label: 'Supplier' },
            { key: 'qty', label: 'Qty', align: 'right', render: (p) => num(p.qty) },
            { key: 'unitCost', label: 'Each', align: 'right', render: (p) => <span className={p.suspicious ? 'text-rose' : ''}>{da(p.unitCost)}{p.suspicious && <AlertTriangle className="ml-1 inline h-3 w-3" />}</span> },
            { key: 'total', label: 'Total', align: 'right', render: (p) => da(p.total) },
          ]} />
        </Section>
      )}
    </>
  )
}

// ── Customer ──────────────────────────────────────────────────
function CustomerDrawer({ id }) {
  const { ds, open } = useApp()
  const isWalkIn = id === 'walk-in'
  const profile = useMemo(() => (isWalkIn ? null : customerProfiles(ds, today()).find((p) => p.key === id)), [ds, id, isWalkIn])
  const orders = useMemo(() => ds.orders.filter((o) => o.customer === id), [ds, id])
  const counted = orders.filter((o) => o.counted)
  const months = monthsBack(ds).map((m) => {
    const list = counted.filter((o) => o.month === m)
    return { key: m, label: monthShort(m), title: `${monthShort(m)} ${m.slice(0, 4)}`, revenue: list.reduce((s, o) => s + o.value, 0), orders: list.length }
  })
  const fav = new Map()
  for (const o of counted) for (const i of o.items) {
    const f = fav.get(i.productId) || { key: i.productId, label: i.name, qty: 0, revenue: 0 }
    f.qty += i.qty; f.revenue += i.value
    fav.set(i.productId, f)
  }
  const value = counted.reduce((s, o) => s + o.value, 0)
  const seg = profile && SEGMENTS[profile.segment]
  return (
    <>
      <Head kicker={isWalkIn ? 'Counter sales without a name' : 'Customer'} title={isWalkIn ? 'Walk-in customers' : profile?.name || orders[0]?.clientName || 'Customer'}
        sub={profile?.phone ? <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1 hover:text-plum"><Phone className="h-3.5 w-3.5" /> {profile.phone}</a> : null}>
        <FilterButton filterKey="customer" value={id} text="Show only this customer everywhere" />
        {seg && <Pill tone={seg.tone}>{seg.label}</Pill>}
        {profile && <Pill>{label(CHANNEL_LABELS, profile.channel)}</Pill>}
      </Head>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Spent in total" value={da(value)}>{plural(counted.length, 'order')}</Stat>
        <Stat label="Average order" value={da(counted.length ? value / counted.length : 0)} tone="sage" />
        {profile ? <Stat label="Last visit" value={`${num(profile.daysSince)} d`} tone="amber">{dayLabel(profile.last)}</Stat> : <Stat label="Orders" value={num(counted.length)} tone="amber" />}
        <Stat label="Still owes" value={da(counted.reduce((s, o) => s + o.due, 0))} tone="rose" />
      </div>
      {profile && (
        <p className="mb-5 rounded-xl bg-paper p-3 text-sm text-muted">
          Customer since {dayLabel(profile.first, { day: 'numeric', month: 'long', year: 'numeric' })}.
          {profile.avgGap ? ` Comes back every ${num(profile.avgGap)} days on average${profile.daysSince > profile.avgGap * 1.5 ? ', so this visit is overdue.' : '.'}` : ' Has ordered once.'}
          {seg && ` ${seg.hint}.`}
        </p>
      )}
      <Section title="Spending per month"><Bars data={months} height={160} /></Section>
      <Section title="What they buy">
        <BarList rows={[...fav.values()].sort((a, b) => b.revenue - a.revenue)} limit={8} onSelect={(k) => open('product', k)} extra={(r) => `${num(r.qty)} units`} />
      </Section>
      <Section title="Orders">
        <DataTable dense pageSize={10} rows={[...orders].reverse().map((o) => ({ ...o, key: o.id, muted: !o.counted }))} onRowClick={(o) => open('order', o.id)} columns={orderColumns()} initialSort={{ key: 'number', dir: 'desc' }} />
      </Section>
    </>
  )
}

// ── Order ─────────────────────────────────────────────────────
function OrderDrawer({ id }) {
  const { ds, open } = useApp()
  const o = ds.orders.find((x) => x.id === id)
  if (!o) return <p className="text-sm text-muted">Order not found.</p>
  const cost = o.items.every((i) => i.cost != null) ? o.items.reduce((s, i) => s + i.cost, 0) : null
  return (
    <>
      <Head kicker={`${label({ quick_sale: 'Quick sale', order: 'Order' }, o.type)} · ${formatDateTime(o.at)}`} title={`#${o.number}`}
        sub={<>Taken by {o.staff}</>}>
        <Pill tone={o.status === 'cancelled' ? 'rose' : o.status === 'done' ? 'sage' : 'amber'}>{label(STATUS_LABELS, o.status)}</Pill>
        <Pill tone={{ paid: 'sage', partial: 'amber', unpaid: 'rose' }[o.payStatus] || 'muted'}>{label(PAY_STATUS_LABELS, o.payStatus)}</Pill>
        <Pill>{label(CHANNEL_LABELS, o.channel)}</Pill>
        <Pill>{label(PAYMENT_LABELS, o.payment)}</Pill>
      </Head>
      <button onClick={() => open('customer', o.customer)} className="mb-5 flex w-full items-center justify-between rounded-xl bg-paper p-3 text-left text-sm transition hover:bg-plum-soft/50">
        <span><span className="text-muted">Customer</span> <span className="font-medium text-ink">{o.clientName || 'Walk-in'}</span> {o.clientPhone && <span className="text-muted">· {o.clientPhone}</span>}</span>
        <span className="text-xs text-plum">View history →</span>
      </button>
      <Section title="Items">
        <ul className="divide-y divide-line/70 rounded-xl border border-line bg-paper">
          {o.items.map((i) => (
            <li key={i.id}>
              <button onClick={() => open('product', i.productId)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-plum-soft/40">
                <span><span className="tabular font-semibold text-plum">{num(i.qty)}×</span> {i.name} <span className="text-xs text-muted">at {da(i.unitPrice)}</span></span>
                <span className="tabular text-right">{da(i.value)}{i.cost != null && <span className="block text-[11px] text-sage">profit {da(i.value - i.cost)}</span>}</span>
              </button>
            </li>
          ))}
          {!o.items.length && <li className="px-3 py-3 text-sm text-muted">No items recorded.</li>}
        </ul>
      </Section>
      <Section title="Money">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-paper p-3 text-sm">
          <dt className="text-muted">Total</dt><dd className="tabular text-right font-medium">{da(o.value)}</dd>
          {o.discount > 0 && <><dt className="text-muted">Discount given</dt><dd className="tabular text-right text-rose">−{da(o.discount)}</dd></>}
          {o.extra > 0 && <><dt className="text-muted">Extra charge</dt><dd className="tabular text-right">+{da(o.extra)}</dd></>}
          <dt className="text-muted">Paid</dt><dd className="tabular text-right">{da(o.paid)}</dd>
          <dt className="text-muted">Still owed</dt><dd className={`tabular text-right ${o.due ? 'text-amber' : ''}`}>{da(o.due)}</dd>
          {cost != null && <><dt className="text-muted">Flower cost</dt><dd className="tabular text-right">{da(cost)}</dd><dt className="text-muted">Profit</dt><dd className="tabular text-right text-sage">{da(o.value - cost)}</dd></>}
        </dl>
      </Section>
      {(o.deliveryDate || o.delivery !== 'pickup') && (
        <Section title="Delivery">
          <p className="rounded-xl bg-paper p-3 text-sm">
            {label(DELIVERY_LABELS, o.delivery)}{o.deliveryDate && ` for ${dayLabel(o.deliveryDate, { weekday: 'long', day: 'numeric', month: 'long' })}`}{o.deliveryTime && ` at ${o.deliveryTime.slice(0, 5)}`}.
            {o.wilaya && ` ${o.city ? o.city + ', ' : ''}${o.wilaya}.`}
            {o.deliveredDay && ` Delivered ${dayLabel(o.deliveredDay)}${o.deliveryDate && o.deliveredDay > o.deliveryDate ? `, ${daysBetween(o.deliveryDate, o.deliveredDay)} days late` : ''}.`}
            {o.delays > 0 && ` Rescheduled ${plural(o.delays, 'time')}${o.delayReason ? `: ${o.delayReason}` : ''}.`}
          </p>
        </Section>
      )}
      {(o.notes || o.voidReason) && <Section title="Notes"><p className="rounded-xl bg-paper p-3 text-sm">{o.voidReason && <span className="text-rose">Cancelled: {o.voidReason}. </span>}{o.notes}</p></Section>}
    </>
  )
}

// ── Day ───────────────────────────────────────────────────────
function DayDrawer({ id: day }) {
  const { ds, sel, open, dailyTarget } = useApp()
  const orders = sel.orders.filter((o) => o.day === day)
  const counted = orders.filter((o) => o.counted)
  const revenue = counted.reduce((s, o) => s + (o.scopedValue ?? o.value), 0)
  const products = new Map()
  for (const o of counted) for (const i of (o.matchedItems || o.items)) {
    const p = products.get(i.productId) || { key: i.productId, label: i.name, qty: 0, revenue: 0 }
    p.qty += i.qty; p.revenue += i.value
    products.set(i.productId, p)
  }
  const hrs = hoursOf({ counted })
  return (
    <>
      <Head kicker="Day" title={dayLabel(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Sales" value={da(revenue)}>{dailyTarget ? `${Math.round((revenue / dailyTarget) * 100)}% of daily target` : null}</Stat>
        <Stat label="Orders" value={num(counted.length)} tone="rose">{orders.length - counted.length ? `${orders.length - counted.length} cancelled` : null}</Stat>
        <Stat label="Average" value={da(counted.length ? revenue / counted.length : 0)} tone="sage" />
      </div>
      {dailyTarget > 0 && <Meter value={revenue / dailyTarget} tone={revenue >= dailyTarget ? 'sage' : 'amber'} className="mb-5" />}
      <Section title="By hour"><Bars data={hrs} height={150} /></Section>
      <Section title="What sold"><BarList rows={[...products.values()].sort((a, b) => b.revenue - a.revenue)} onSelect={(k) => open('product', k)} extra={(r) => `${num(r.qty)} units`} /></Section>
      <Section title="Orders">
        <DataTable dense pageSize={20} rows={orders.map((o) => ({ ...o, key: o.id, muted: !o.counted }))} onRowClick={(o) => open('order', o.id)} initialSort={{ key: 'number', dir: 'asc' }}
          columns={[
            { key: 'number', label: 'Time', sort: (o) => o.at, render: (o) => <><p className="font-medium">{formatTime(o.at)}</p><p className="text-xs text-muted">#{o.number}</p></> },
            { key: 'client', label: 'Customer', sort: (o) => o.clientName, render: (o) => o.clientName || 'Walk-in' },
            { key: 'staff', label: 'By' },
            { key: 'value', label: 'Total', align: 'right', render: (o) => da(o.value) },
          ]} />
      </Section>
    </>
  )
}

// ── Team member ───────────────────────────────────────────────
function StaffDrawer({ id }) {
  const { ds, sel, period, open } = useApp()
  const orders = sel.orders.filter((o) => (o.staffId || 'unknown') === id)
  const counted = orders.filter((o) => o.counted)
  const revenue = counted.reduce((s, o) => s + (o.scopedValue ?? o.value), 0)
  const all = sel.counted.reduce((s, o) => s + (o.scopedValue ?? o.value), 0)
  const products = new Map()
  for (const o of counted) for (const i of (o.matchedItems || o.items)) {
    const p = products.get(i.productId) || { key: i.productId, label: i.name, qty: 0, revenue: 0 }
    p.qty += i.qty; p.revenue += i.value
    products.set(i.productId, p)
  }
  const wd = WEEKDAYS.map((d, i) => ({ key: i, label: d, revenue: counted.filter((o) => o.weekday === i).reduce((s, o) => s + o.value, 0), orders: counted.filter((o) => o.weekday === i).length }))
  const discounts = counted.reduce((s, o) => s + o.discount, 0)
  return (
    <>
      <Head kicker={`Team · ${period.short}`} title={ds.staffName.get(id) || 'Unknown'}>
        {id !== 'unknown' && <FilterButton filterKey="staff" value={id} text="Show only their sales everywhere" />}
      </Head>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sales" value={da(revenue)}>{ratio(all ? revenue / all : 0)} of the shop</Stat>
        <Stat label="Orders" value={num(counted.length)} tone="rose">{orders.length - counted.length ? `${orders.length - counted.length} cancelled` : 'none cancelled'}</Stat>
        <Stat label="Average order" value={da(counted.length ? revenue / counted.length : 0)} tone="sage" />
        <Stat label="Discounts given" value={da(discounts)} tone="amber">{num1(revenue + discounts ? (discounts / (revenue + discounts)) * 100 : 0)}% of full price</Stat>
      </div>
      <Section title="By weekday"><Bars data={wd} height={140} /></Section>
      <Section title="What they sold"><BarList rows={[...products.values()].sort((a, b) => b.revenue - a.revenue)} onSelect={(k) => open('product', k)} extra={(r) => `${num(r.qty)} units`} /></Section>
      <Section title="Orders">
        <DataTable dense pageSize={10} rows={[...orders].reverse().map((o) => ({ ...o, key: o.id, muted: !o.counted }))} onRowClick={(o) => open('order', o.id)} columns={orderColumns()} />
      </Section>
    </>
  )
}
