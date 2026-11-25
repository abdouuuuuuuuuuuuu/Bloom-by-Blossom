import { useMemo, useState } from 'react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, BarList, Segmented, Delta } from '../components/ui.jsx'
import { Bars, Heatmap } from '../components/Charts.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { makePeriod } from '../model/period.js'
import { da, delta, num, ratio } from '../lib/format.js'
import { CHANNEL_LABELS, DELIVERY_LABELS, PAYMENT_LABELS, TYPE_LABELS, label } from '../lib/labels.js'
import { WEEKDAYS_LONG, today } from '../lib/time.js'

export default function Sales() {
  const { ds, sel, prevSel, period, prev, filters, setFilter, patchFilters, setPeriod, open, dailyTarget } = useApp()
  const [measure, setMeasure] = useState('revenue')
  const [histMeasure, setHistMeasure] = useState('revenue')

  const d = useMemo(() => ({
    s: M.summary(sel),
    p: M.summary(prevSel),
    tl: M.timeline(sel, period, dailyTarget),
    history: M.monthlyHistory(ds, (period.end < today() ? period.end : today()).slice(0, 7), 12, filters),
    heat: M.heatmap(sel),
    weekdays: M.weekdays(sel, period),
    hours: M.hours(sel),
    channels: M.breakdown(sel, (o) => o.channel, (k) => label(CHANNEL_LABELS, k)),
    payments: M.breakdown(sel, (o) => o.payment, (k) => label(PAYMENT_LABELS, k)),
    types: M.breakdown(sel, (o) => o.type, (k) => label(TYPE_LABELS, k)),
    delivery: M.breakdown(sel, (o) => o.delivery, (k) => label(DELIVERY_LABELS, k)),
    baskets: M.basketSizes(sel),
    staff: M.team(sel),
  }), [ds, sel, prevSel, period, filters, dailyTarget])

  const compare = [
    { key: 'revenue', label: 'Sales value', now: d.s.revenue, before: d.p.revenue, fmt: da },
    { key: 'orders', label: 'Orders', now: d.s.orders, before: d.p.orders, fmt: num },
    { key: 'avg', label: 'Average order', now: d.s.avgOrder, before: d.p.avgOrder, fmt: da },
    { key: 'items', label: 'Items sold', now: d.s.itemsSold, before: d.p.itemsSold, fmt: num },
    { key: 'customers', label: 'Named customers', now: d.s.customers, before: d.p.customers, fmt: num },
    { key: 'profit', label: 'Gross profit (est.)', now: d.s.estGrossProfit, before: d.p.estGrossProfit, fmt: (v) => (v == null ? '—' : da(v)) },
    { key: 'discounts', label: 'Discounts given', now: d.s.discounts, before: d.p.discounts, fmt: da, invert: true },
    { key: 'cancelled', label: 'Cancelled orders', now: d.s.cancelled, before: d.p.cancelled, fmt: num, invert: true },
  ]

  const onTimeline = (row) => (d.tl.grain === 'day' ? open('day', row.key) : setPeriod(makePeriod('month', row.key)))

  return (
    <>
      <PageHeader title="Sales" subtitle={`${period.label} · how, when and through which channel you sell`} />

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={d.tl.grain === 'day' ? 'Every day' : 'Every month'} hint="Click a bar for details"
          action={<Segmented label="Measure" value={measure} onChange={setMeasure} options={[['revenue', 'Sales'], ['orders', 'Orders'], ['cumulative', 'Running total']]} />}>
          <Bars data={d.tl.rows} measure={measure} height={280} onSelect={onTimeline} target={measure === 'revenue' && d.tl.grain === 'day' ? dailyTarget : 0} />
        </Card>
        <Card title="Compared with before" hint={prev.label} info="Same filters, the period just before. While a period is still running, only the same number of days is compared, so it stays fair.">
          <ul className="divide-y divide-line/60">
            {compare.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-muted">{c.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular font-medium text-ink">{c.fmt(c.now)}</span>
                  <Delta value={c.now == null || c.before == null ? null : delta(c.now, c.before)} invert={c.invert} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mb-4" title="The last 12 months" hint="Spot seasons and growth. Click a month to open it."
        action={<Segmented label="Measure" value={histMeasure} onChange={setHistMeasure} options={[['revenue', 'Sales'], ['orders', 'Orders'], ['avgOrder', 'Avg order'], ['customers', 'Customers']]} />}>
        <Bars data={d.history} measure={histMeasure === 'customers' ? 'customers' : histMeasure} height={220} onSelect={(row) => setPeriod(makePeriod('month', row.key))} activeKey={period.kind === 'month' ? period.value : null}
          extra={(r) => <p className="tabular text-muted">avg {da(r.avgOrder)} · {num(r.customers)} customers</p>} />
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="When customers buy" hint="Darker = more sales. Click a cell to look only at that hour on that day."
          info="Each cell is one hour of one weekday, summed over the period. Use it to plan staff and to time your Instagram posts.">
          <Heatmap data={d.heat} active={filters.weekday != null && filters.hour != null ? { weekday: Number(filters.weekday), hour: Number(filters.hour) } : null}
            onSelect={(wd, h) => (Number(filters.weekday) === wd && Number(filters.hour) === h && filters.hour != null ? patchFilters({ weekday: null, hour: null }) : patchFilters({ weekday: wd, hour: h }))} />
        </Card>
        <Card title="Average day by weekday" info="Sales on that weekday ÷ how many of those weekdays the period had. Fairer than totals.">
          <BarList rows={d.weekdays.map((w) => ({ ...w, label: WEEKDAYS_LONG[w.key] }))} valueKey="perDay" limit={7} onSelect={(k) => setFilter('weekday', k)} active={filters.weekday}
            extra={(r) => `${num(r.orders)} orders over ${r.days} days`} />
        </Card>
      </div>

      <Card className="mb-4" title="By hour of the day" hint="Click an hour to filter">
        <Bars data={d.hours} height={180} onSelect={(r) => setFilter('hour', r.key)} activeKey={filters.hour} />
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Channels" hint="Click to filter everything"><BarList rows={d.channels} onSelect={(k) => setFilter('channel', k)} active={filters.channel} extra={(r) => `${num(r.orders)} orders · avg ${da(r.avg)}`} /></Card>
        <Card title="Payment"><BarList rows={d.payments} onSelect={(k) => setFilter('payment', k)} active={filters.payment} extra={(r) => `${num(r.orders)} orders · avg ${da(r.avg)}`} /></Card>
        <Card title="Quick sales vs orders" info="Quick sales are rung up at the counter. Orders are prepared for a date."><BarList rows={d.types} onSelect={(k) => setFilter('type', k)} active={filters.type} extra={(r) => `${num(r.orders)} · avg ${da(r.avg)}`} /></Card>
        <Card title="Pickup or delivery"><BarList rows={d.delivery} onSelect={(k) => setFilter('delivery', k)} active={filters.delivery} extra={(r) => `${num(r.orders)} · avg ${da(r.avg)}`} /></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Order sizes" info="How many orders fall into each price band, and how much of your sales each band brings.">
          <DataTable dense rows={d.baskets} columns={[
            { key: 'label', label: 'Order value (DA)', sortable: false },
            { key: 'orders', label: 'Orders', align: 'right', render: (r) => num(r.orders) },
            { key: 'revenue', label: 'Sales', align: 'right', render: (r) => da(r.revenue) },
            { key: 'share', label: 'Share of sales', align: 'right', render: (r) => ratio(r.share) },
          ]} />
        </Card>
        <Card title="Team" hint="Click a person for their sales">
          <DataTable dense rows={d.staff} onRowClick={(r) => open('staff', r.key)} initialSort={{ key: 'revenue', dir: 'desc' }} exportName={`bloom-team-${period.start}`} columns={[
            { key: 'label', label: 'Person' },
            { key: 'orders', label: 'Orders', align: 'right', render: (r) => num(r.orders) },
            { key: 'revenue', label: 'Sales', align: 'right', render: (r) => da(r.revenue) },
            { key: 'avg', label: 'Avg', align: 'right', render: (r) => da(r.avg) },
            { key: 'share', label: 'Share', align: 'right', render: (r) => ratio(r.share) },
          ]} />
        </Card>
      </div>
    </>
  )
}
