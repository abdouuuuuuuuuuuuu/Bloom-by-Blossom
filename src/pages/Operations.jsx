import { useMemo } from 'react'
import { Truck, CalendarCheck, Clock, XCircle, CalendarClock } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, BarList } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { da, num, ratio } from '../lib/format.js'
import { DELIVERY_LABELS, label } from '../lib/labels.js'
import { dayLabel, daysBetween, formatDateTime, today } from '../lib/time.js'

export default function Operations() {
  const { sel, period, filters, setFilter, open } = useApp()
  const d = useMemo(() => ({
    ops: M.operations(sel),
    delivery: M.breakdown(sel, (o) => o.delivery, (k) => label(DELIVERY_LABELS, k)),
    wilayas: M.breakdown({ counted: sel.counted.filter((o) => o.wilaya) }, (o) => o.wilaya, (k) => k),
    team: M.team(sel),
  }), [sel])
  const o = d.ops

  return (
    <>
      <PageHeader title="Operations" subtitle={`${period.label} · deliveries, cancellations and the team`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={CalendarClock} label="Orders with a date" value={num(o.scheduled)} info="Prepared orders (not quick sales) with a delivery or pickup date.">{num(o.delivered)} marked delivered</Stat>
        <Stat icon={CalendarCheck} tone="sage" label="On time" value={ratio(o.onTimeRate)} info="Of orders marked delivered, the share delivered on or before their date. Orders never marked delivered are not counted.">{num(o.onTime)} of {num(o.delivered)}</Stat>
        <Stat icon={Clock} tone="amber" label="Rescheduled" value={num(o.delayed.length)}>{ratio(o.scheduled ? o.delayed.length / o.scheduled : null)} of dated orders</Stat>
        <Stat icon={XCircle} tone="rose" label="Cancelled" value={num(o.cancelled.length)}>{ratio(o.cancelRate)} · {da(o.cancelledValue)}</Stat>
        <Stat icon={Truck} tone="plum" label="Overdue now" value={num(o.overdue.length)} info="Date passed, not done, not marked delivered.">{o.overdue.length ? 'open them below' : 'nothing late'}</Stat>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card title="Pickup or delivery" hint="Click to filter everything">
          <BarList rows={d.delivery} onSelect={(k) => setFilter('delivery', k)} active={filters.delivery} extra={(r) => `${num(r.orders)} orders · avg ${da(r.avg)}`} />
        </Card>
        <Card title="How far ahead customers order" info="Days between taking the order and its delivery date.">
          <BarList rows={o.lead} valueKey="orders" format={(v) => num(v)} limit={5} extra={(r) => da(r.revenue)} empty="No dated orders." />
        </Card>
        <Card title="Where orders go" hint="Wilaya on delivery orders. Click to filter.">
          <BarList rows={d.wilayas} onSelect={(k) => setFilter('wilaya', k)} active={filters.wilaya} extra={(r) => `${num(r.orders)} orders`} empty="No wilaya recorded on orders in this period." />
        </Card>
      </div>

      {o.overdue.length > 0 && (
        <Card className="mb-4" title="Overdue orders" hint="The date has passed and the order is not done">
          <DataTable dense rows={o.overdue.map((x) => ({ ...x, key: x.id }))} onRowClick={(x) => open('order', x.id)} columns={[
            { key: 'number', label: 'Order', render: (x) => `#${x.number}` },
            { key: 'clientName', label: 'Customer' },
            { key: 'deliveryDate', label: 'Was due', render: (x) => <>{dayLabel(x.deliveryDate)}<p className="text-xs text-rose">{daysBetween(x.deliveryDate, today())} days ago</p></> },
            { key: 'value', label: 'Total', align: 'right', render: (x) => da(x.value) },
          ]} />
        </Card>
      )}

      <Card className="mb-4" title="Team" hint="Click a person for their sales" info="Discount rate = discounts they gave ÷ full price before discount. Quick share = share of their sales rung up as quick sales.">
        <DataTable rows={d.team} onRowClick={(r) => open('staff', r.key)} exportName={`bloom-team-${period.start}`} initialSort={{ key: 'revenue', dir: 'desc' }} columns={[
          { key: 'label', label: 'Person', render: (r) => <span className="font-medium">{r.label}</span> },
          { key: 'orders', label: 'Orders', align: 'right', render: (r) => num(r.orders) },
          { key: 'revenue', label: 'Sales', align: 'right', render: (r) => <>{da(r.revenue)}<p className="text-[11px] text-muted">{ratio(r.share)}</p></> },
          { key: 'avg', label: 'Avg order', align: 'right', render: (r) => da(r.avg) },
          { key: 'items', label: 'Items', align: 'right', render: (r) => num(r.items) },
          { key: 'quickShare', label: 'Quick sales', align: 'right', render: (r) => ratio(r.quickShare) },
          { key: 'discountRate', label: 'Discounts', align: 'right', render: (r) => <>{ratio(r.discountRate)}<p className="text-[11px] text-muted">{da(r.discounts)}</p></> },
          { key: 'cancelled', label: 'Cancelled', align: 'right', render: (r) => num(r.cancelled) },
        ]} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Cancelled orders" hint="Click to open">
          <DataTable dense rows={o.cancelled.map((x) => ({ ...x, key: x.id }))} onRowClick={(x) => open('order', x.id)} exportName={`bloom-cancelled-${period.start}`} empty="Nothing cancelled. Well done." columns={[
            { key: 'number', label: 'Order', render: (x) => <><p className="font-medium">#{x.number}</p><p className="text-xs text-muted">{formatDateTime(x.at)}</p></> },
            { key: 'clientName', label: 'Customer', render: (x) => x.clientName || 'Walk-in' },
            { key: 'reason', label: 'Reason', sort: (x) => x.voidReason, render: (x) => <span className="text-xs text-muted">{x.voidReason || (x.payStatus === 'refunded' ? 'Refunded' : 'Cancelled')}</span> },
            { key: 'staff', label: 'By' },
            { key: 'value', label: 'Value', align: 'right', render: (x) => da(x.value) },
          ]} />
        </Card>
        <Card title="Rescheduled orders" hint="Orders whose date was moved">
          <DataTable dense rows={o.delayed.map((x) => ({ ...x, key: x.id }))} onRowClick={(x) => open('order', x.id)} empty="No order was rescheduled." columns={[
            { key: 'number', label: 'Order', render: (x) => `#${x.number}` },
            { key: 'clientName', label: 'Customer' },
            { key: 'dates', label: 'Moved', sortable: false, render: (x) => <span className="text-xs">{x.originalDeliveryDate ? dayLabel(x.originalDeliveryDate, { day: 'numeric', month: 'short' }) : '?'} → {dayLabel(x.deliveryDate, { day: 'numeric', month: 'short' })}</span> },
            { key: 'delayReason', label: 'Why', render: (x) => <span className="text-xs text-muted">{x.delayReason || '—'}</span> },
          ]} />
        </Card>
      </div>
    </>
  )
}
