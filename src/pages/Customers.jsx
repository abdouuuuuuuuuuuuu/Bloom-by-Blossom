import { useMemo, useState } from 'react'
import { Users, UserPlus, Repeat, Gem, Clock, Phone } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, BarList } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { da, num, ratio } from '../lib/format.js'
import { CHANNEL_LABELS, label } from '../lib/labels.js'
import { dayLabel, today } from '../lib/time.js'

export default function Customers() {
  const { ds, sel, period, open, filters, setFilter } = useApp()
  const [segment, setSegment] = useState(null)
  const asOf = period.end < today() ? period.end : today()

  const d = useMemo(() => {
    const profiles = M.customerProfiles(ds, asOf)
    const byKey = new Map(profiles.map((p) => [p.key, p]))
    const newChannels = M.breakdown({ counted: sel.counted.filter((o) => byKey.get(o.customer)?.first === o.day && o.customer !== 'walk-in') }, (o) => o.channel, (k) => label(CHANNEL_LABELS, k))
    return {
      s: M.summary(sel),
      mix: M.customerMix(ds, sel),
      profiles,
      segments: M.segments(profiles),
      loyalty: M.loyaltyStats(profiles),
      inPeriod: M.periodCustomers(sel, byKey),
      newChannels,
    }
  }, [ds, sel, asOf])

  const segRows = segment ? d.profiles.filter((p) => p.segment === segment) : d.profiles
  const winBack = d.profiles.filter((p) => p.segment === 'risk' || (p.segment === 'loyal' && p.avgGap && p.daysSince > p.avgGap * 1.5)).sort((a, b) => b.value - a.value)

  return (
    <>
      <PageHeader title="Customers" subtitle={`${period.label} · who buys, who comes back, who is slipping away`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Users} label="Bought this period" value={num(d.s.customers)} info="Named customers (with a name or phone) who bought in the period.">{num(d.s.walkInOrders)} walk-in sales too</Stat>
        <Stat icon={UserPlus} tone="sage" label="New" value={num(d.mix.newCustomers)} info="First ever order falls in this period.">{num(d.mix.returning)} returning</Stat>
        <Stat icon={Repeat} tone="plum" label="Come back rate" value={ratio(d.loyalty.repeatRate)} info="Share of all named customers (up to the end of the period) with 2 or more orders.">of {num(d.loyalty.customers)} customers</Stat>
        <Stat icon={Clock} tone="amber" label="Comes back every" value={d.loyalty.avgGap ? `${Math.round(d.loyalty.avgGap)} days` : '—'} info="Average days between two orders, for customers who ordered more than once." />
        <Stat icon={Gem} tone="rose" label="Value per customer" value={da(d.loyalty.avgLifetimeValue)} info="Average total spent by a named customer since their first order." />
        <Stat icon={Repeat} tone="sage" label="From returning" value={ratio(d.loyalty.repeatValueShare)} info="Share of named-customer sales that comes from customers with 2+ orders." />
      </div>

      <Card className="mb-4" title="Customer groups" hint="Click a group to list its customers" info="Based on how often and how recently each customer bought, as of the end of the selected period.">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {d.segments.map((s) => (
            <button key={s.key} onClick={() => setSegment(segment === s.key ? null : s.key)} aria-pressed={segment === s.key}
              className={`rounded-2xl border p-3 text-left transition ${segment === s.key ? 'border-plum bg-plum-soft' : 'border-line/70 bg-paper hover:border-plum/40'}`}>
              <Pill tone={s.tone}>{s.label}</Pill>
              <p className="tabular mt-2 font-display text-2xl text-ink">{num(s.count)}</p>
              <p className="tabular text-xs text-muted">{da(s.value)} · {ratio(s.share)}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted">{s.hint}</p>
            </button>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={segment ? `${M.SEGMENTS[segment].label} customers` : `Who bought · ${period.short}`} hint="Click a customer for everything they bought">
          {segment ? (
            <DataTable rows={segRows} onRowClick={(r) => open('customer', r.key)} exportName={`bloom-customers-${segment}`} search={(r) => `${r.name} ${r.phone}`} initialSort={{ key: 'value', dir: 'desc' }} columns={[
              { key: 'name', label: 'Customer', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.phone || 'no phone'}</p></> },
              { key: 'count', label: 'Orders', align: 'right', render: (r) => num(r.count) },
              { key: 'value', label: 'Spent', align: 'right', render: (r) => da(r.value) },
              { key: 'last', label: 'Last order', render: (r) => <>{dayLabel(r.last, { day: 'numeric', month: 'short' })}<p className="text-xs text-muted">{r.daysSince} days ago</p></> },
              { key: 'fav', label: 'Usually buys', sortable: false, csv: (r) => r.favorites.map((f) => f.name).join(', '), render: (r) => <span className="text-xs text-muted">{r.favorites.slice(0, 2).map((f) => f.name).join(', ')}</span> },
            ]} />
          ) : (
            <DataTable rows={d.inPeriod} onRowClick={(r) => open('customer', r.key)} exportName={`bloom-customers-${period.start}`} search={(r) => `${r.name} ${r.phone}`} initialSort={{ key: 'revenue', dir: 'desc' }} columns={[
              { key: 'name', label: 'Customer', render: (r) => (
                <div className="flex items-center gap-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${r.key === 'walk-in' ? 'bg-[#f2edf3] text-muted' : 'bg-plum-soft text-plum'}`}>{r.key === 'walk-in' ? '··' : r.name.slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0"><p className="flex items-center gap-1.5 truncate font-medium">{r.name}{r.isNew && <Pill tone="sage">New</Pill>}{r.segment && !r.isNew && <Pill tone={M.SEGMENTS[r.segment].tone}>{M.SEGMENTS[r.segment].label}</Pill>}</p><p className="text-xs text-muted">{r.phone || (r.key === 'walk-in' ? 'no name given' : 'no phone')}</p></div>
                </div>), csv: (r) => r.name },
              { key: 'orders', label: 'Orders', align: 'right', render: (r) => num(r.orders) },
              { key: 'revenue', label: 'Spent', align: 'right', render: (r) => da(r.revenue) },
              { key: 'lifetime', label: 'All time', align: 'right', render: (r) => (r.lifetime == null ? '—' : da(r.lifetime)) },
              { key: 'due', label: 'Owes', align: 'right', render: (r) => (r.due ? <span className="text-amber">{da(r.due)}</span> : '—') },
              { key: 'products', label: 'Bought', sortable: false, csv: (r) => r.products.map((p) => `${p.qty}x ${p.name}`).join(', '), render: (r) => <span className="line-clamp-1 text-xs text-muted">{r.products.slice(0, 3).map((p) => `${p.qty}× ${p.name}`).join(', ')}</span> },
            ]} />
          )}
        </Card>
        <div className="space-y-4">
          <Card title="Win them back" hint="Regulars who have gone quiet. A message or small offer works best now."
            info="'At risk' customers, plus regulars whose last order is 1.5× longer ago than their usual gap.">
            {winBack.length ? (
              <ul className="space-y-1">
                {winBack.slice(0, 8).map((c) => (
                  <li key={c.key}>
                    <button onClick={() => open('customer', c.key)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-plum-soft/50">
                      <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="text-xs text-muted">{c.daysSince} days ago · {num(c.count)} orders</span></span>
                      <span className="tabular shrink-0 text-right text-xs">{da(c.value)}{c.phone && <span className="flex items-center justify-end gap-1 text-muted"><Phone className="h-3 w-3" />{c.phone}</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="py-4 text-sm text-muted">No regular has gone quiet.</p>}
          </Card>
          <Card title="Where new customers come from" hint="Click to filter">
            <BarList rows={d.newChannels} valueKey="orders" format={(v) => `${num(v)}`} onSelect={(k) => setFilter('channel', k)} active={filters.channel} empty="No new customers in this period." />
          </Card>
        </div>
      </div>
    </>
  )
}
