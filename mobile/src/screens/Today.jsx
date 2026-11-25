import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, HandCoins, Plus, RefreshCw, Sun, Bike } from 'lucide-react'
import { useApp, navigate } from '../state/app.jsx'
import { Screen, Section, Empty, Skeleton, Button } from '../components/ui.jsx'
import { OrderCard } from '../components/OrderCard.jsx'
import { can } from '../lib/permissions.js'
import { da, num } from '../lib/format.js'
import { dayKey, longDay, today } from '../lib/time.js'
import { byDue, isCancelled, isDelivery, isOpen, owes, urgency, stage } from '../lib/orders.js'

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Algiers' }))
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function Today() {
  const { orders, role, profile, sync, refresh } = useApp()
  const rights = can(role)
  const t = today()

  const d = useMemo(() => {
    const list = orders || []
    const open = list.filter(isOpen)
    const forDelivery = role === 'delivery' ? open.filter(isDelivery) : open
    const late = forDelivery.filter((o) => urgency(o) === 'late').sort(byDue)
    const dueToday = forDelivery.filter((o) => urgency(o) === 'today').sort(byDue)
    const tomorrow = forDelivery.filter((o) => urgency(o) === 'tomorrow').sort(byDue)
    const courier = list.filter((o) => isDelivery(o) && stage(o).key === 'courier')
    const sold = list.filter((o) => !isCancelled(o) && dayKey(o.created_at) === t)
    const unpaid = list.filter(owes)
    return {
      late, dueToday, tomorrow, courier,
      salesToday: sold.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      ordersToday: sold.length,
      unpaidTotal: unpaid.reduce((s, o) => s + Number(o.amount_due || 0), 0),
      unpaidCount: unpaid.length,
    }
  }, [orders, role, t])

  const first = (profile?.full_name || '').split(' ')[0]
  return (
    <Screen title={`${greeting()}${first ? `, ${first}` : ''}`} subtitle={longDay(t)}
      actions={<button onClick={() => refresh({ products: true })} aria-label="Refresh" className="grid h-10 w-10 place-items-center rounded-full text-plum active:bg-plum-soft"><RefreshCw className={`h-5 w-5 ${sync.loading ? 'animate-spin' : ''}`} /></button>}>
      {sync.error && <p role="alert" className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm text-rose">Could not refresh: {sync.error}</p>}

      {!orders ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : (
        <>
          <div className="rise mb-5 grid grid-cols-2 gap-3">
            <Tile icon={Sun} label="Due today" value={num(d.dueToday.length)} note={d.late.length ? `${d.late.length} late` : 'nothing late'} warn={d.late.length > 0} onClick={() => navigate('orders')} />
            {rights.sales
              ? <Tile icon={HandCoins} label="Sold today" value={da(d.salesToday)} note={`${num(d.ordersToday)} orders`} />
              : <Tile icon={CalendarClock} label="Tomorrow" value={num(d.tomorrow.length)} note="to prepare" />}
            {rights.payment && <Tile icon={HandCoins} label="Still owed" value={da(d.unpaidTotal)} note={`${num(d.unpaidCount)} orders`} warn={d.unpaidCount > 0} onClick={() => navigate('orders?f=unpaid')} />}
            <Tile icon={Bike} label="With courier" value={num(d.courier.length)} note="out for delivery" onClick={() => navigate('orders?f=delivery')} />
          </div>

          {rights.create && (
            <Button size="lg" icon={Plus} className="mb-6 w-full" onClick={() => navigate('new')}>New order</Button>
          )}

          {d.late.length > 0 && (
            <Section title={<span className="flex items-center gap-1.5 text-rose"><AlertTriangle className="h-4 w-4" /> Late</span>}>
              <List orders={d.late} />
            </Section>
          )}
          <Section title={role === 'delivery' ? 'Deliveries today' : 'Today'}>
            {d.dueToday.length ? <List orders={d.dueToday} showDay={false} /> : <p className="card px-4 py-5 text-center text-sm text-muted">Nothing else due today.</p>}
          </Section>
          <Section title="Tomorrow">
            {d.tomorrow.length ? <List orders={d.tomorrow} showDay={false} /> : <p className="card px-4 py-5 text-center text-sm text-muted">Nothing booked for tomorrow yet.</p>}
          </Section>
          {!d.late.length && !d.dueToday.length && !d.tomorrow.length && (
            <Empty icon={CalendarClock} title="A calm day">Open orders for later dates are in the Orders tab.</Empty>
          )}
        </>
      )}
    </Screen>
  )
}

function List({ orders, showDay }) {
  return <ul className="space-y-3">{orders.map((o) => <li key={o.id}><OrderCard order={o} showDay={showDay} /></li>)}</ul>
}

function Tile({ icon: Icon, label, value, note, warn, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`card p-4 text-left ${onClick ? 'press' : ''}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
      <p className="tabular mt-1.5 truncate font-display text-[24px] leading-none text-ink">{value}</p>
      <p className={`mt-1.5 text-xs ${warn ? 'font-semibold text-rose' : 'text-muted'}`}>{note}</p>
    </Tag>
  )
}
