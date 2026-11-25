import { useMemo, useState } from 'react'
import { Banknote, ShoppingCart, Receipt, PiggyBank, Wallet, HandCoins, AlertTriangle, Lock } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, BarList, Segmented, Pill } from '../components/ui.jsx'
import { Bars } from '../components/Charts.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { makePeriod } from '../model/period.js'
import { da, daSigned, num, ratio, pct } from '../lib/format.js'
import { dayLabel, daysBetween, today } from '../lib/time.js'

export default function Money() {
  const { ds, sel, period, filters, setPeriod, open, restricted } = useApp()
  const [histMeasure, setHistMeasure] = useState('left')
  const [list, setList] = useState('expenses')

  const d = useMemo(() => ({
    m: M.money(ds, sel, period),
    history: M.monthlyHistory(ds, (period.end < today() ? period.end : today()).slice(0, 7), 12, filters),
    rec: M.receivables(ds),
    bills: M.supplierBills(ds),
  }), [ds, sel, period, filters])
  const m = d.m
  const blocked = restricted.includes('cash') || restricted.includes('purchases')
  const filtered = Object.keys(filters).length > 0

  const pl = [
    { k: 'Sales', v: m.sales, note: 'orders counted in the period' },
    { k: 'Flower purchases', v: -m.bought, note: `${num(m.purchases.length - m.suspicious.length)} supplier deliveries` },
    { k: 'Running costs', v: -m.spent, note: 'cash-outs from the register (no refunds)' },
  ]

  return (
    <>
      <PageHeader title="Money" subtitle={`${period.label} · what came in, what went out, what is left`} />
      {blocked && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber/30 bg-amber-soft/70 p-3 text-sm text-amber">
          <Lock className="h-4 w-4" /> Some money records are only visible to owner accounts, so purchases or running costs show as 0 here.
        </div>
      )}
      {filtered && <p className="mb-3 text-xs text-muted">Filters apply to sales only. Purchases and running costs always show the whole shop.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={Banknote} label="Sales" value={da(m.sales)}>{da(m.collected)} collected</Stat>
        <Stat icon={ShoppingCart} tone="rose" label="Flower purchases" value={da(m.bought)} info="Supplier deliveries dated in the period (Suppliers in Blossom). Purchases that look mistyped are left out.">{pct(m.bought, m.sales)}% of sales</Stat>
        <Stat icon={Receipt} tone="amber" label="Running costs" value={da(m.spent)} info="Cash-outs from the register: transport, supplies, lunch, salaries… Refunds and corrections are not counted.">{pct(m.spent, m.sales)}% of sales</Stat>
        <Stat icon={PiggyBank} tone="sage" label="Left after costs" value={da(m.left)}
          info="Sales − flower purchases − running costs, in the period. Flowers bought this month but sold next month make this swing; look at several months together.">{ratio(m.sales ? m.left / m.sales : null)} of sales</Stat>
        <Stat icon={Wallet} tone="plum" label="Gross profit (est.)" value={m.grossProfit == null ? '—' : da(m.grossProfit)} info="Sales − cost of the flowers actually sold (average supplier price). Does not include running costs.">{m.marginPct == null ? '' : `${ratio(m.marginPct)} margin`}</Stat>
        <Stat icon={HandCoins} tone="rose" label="Customers owe you" value={da(d.rec.total)} info="All unpaid order balances, whatever the period.">{num(d.rec.orders.length)} orders</Stat>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-3">
        <Card title="Simple profit and loss" hint={period.label}>
          <ul className="divide-y divide-line/60 text-sm">
            {pl.map((r) => (
              <li key={r.k} className="flex items-baseline justify-between gap-3 py-2.5">
                <span><span className="text-ink">{r.k}</span><span className="block text-xs text-muted">{r.note}</span></span>
                <span className={`tabular ${r.v < 0 ? 'text-rose' : 'text-ink'}`}>{daSigned(r.v)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 pt-3">
              <span className="font-medium text-ink">Left</span>
              <span className={`tabular font-display text-2xl ${m.left >= 0 ? 'text-sage' : 'text-rose'}`}>{da(m.left)}</span>
            </li>
          </ul>
          <p className="mt-3 rounded-xl bg-cream p-3 text-xs leading-relaxed text-muted">
            Cash view: {da(m.collected)} collected − {da(m.bought - m.purchases.filter((p) => !p.suspicious).reduce((s, p) => s + p.due, 0))} paid to suppliers − {da(m.spent)} costs = <span className="font-medium text-ink">{da(m.leftCash)}</span>.
          </p>
        </Card>
        <Card className="xl:col-span-2" title="12 months of money" hint="Click a month to open it"
          action={<Segmented label="Measure" value={histMeasure} onChange={setHistMeasure} options={[['left', 'Left'], ['revenue', 'Sales'], ['purchases', 'Purchases'], ['expenses', 'Costs'], ['grossProfit', 'Gross profit']]} />}>
          <Bars data={d.history} measure={histMeasure} height={250} onSelect={(r) => setPeriod(makePeriod('month', r.key))} activeKey={period.kind === 'month' ? period.value : null}
            extra={(r) => <p className="tabular text-muted">sales {da(r.revenue)} · bought {da(r.purchases)} · costs {da(r.expenses)}</p>} />
        </Card>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card title="Running costs by type"><BarList rows={m.byCategory} extra={(r) => `${num(r.orders)} entries`} empty="No cash-outs in this period." /></Card>
        <Card title="Purchases by supplier"><BarList rows={m.bySupplier} extra={(r) => `${num(r.orders)} deliveries${r.due ? ` · ${da(r.due)} unpaid` : ''}`} empty="No supplier deliveries in this period." /></Card>
        <Card title="What you bought most" info="Average cost per unit paid in the period.">
          <BarList rows={m.boughtByProduct} onSelect={(k) => open('product', k)} extra={(r) => `${num(r.qty)} units at ${da(r.avgCost)}`} empty="No purchases in this period." />
        </Card>
      </div>

      <Card className="mb-4" title="Details" action={<Segmented label="List" value={list} onChange={setList} options={[['expenses', `Costs (${m.expenses.length})`], ['purchases', `Purchases (${m.purchases.length})`]]} />}>
        {list === 'expenses' ? (
          <DataTable rows={m.expenses.map((e) => ({ ...e, key: e.id, muted: !e.isExpense }))} exportName={`bloom-costs-${period.start}`} search={(e) => `${e.description} ${e.category}`} initialSort={{ key: 'day', dir: 'desc' }} columns={[
            { key: 'day', label: 'Date', render: (e) => dayLabel(e.day, { day: 'numeric', month: 'short' }) },
            { key: 'category', label: 'Type', render: (e) => <>{e.category}{!e.isExpense && <Pill className="ml-1.5">not a cost</Pill>}</> },
            { key: 'description', label: 'What for' },
            { key: 'amount', label: 'Amount', align: 'right', render: (e) => da(e.amount) },
          ]} />
        ) : (
          <DataTable rows={m.purchases.map((p) => ({ ...p, key: p.id, name: p.product.name, muted: p.suspicious }))} onRowClick={(p) => open('product', p.productId)} exportName={`bloom-purchases-${period.start}`} search={(p) => `${p.name} ${p.supplier}`} initialSort={{ key: 'day', dir: 'desc' }} columns={[
            { key: 'day', label: 'Date', render: (p) => dayLabel(p.day, { day: 'numeric', month: 'short' }) },
            { key: 'name', label: 'Product', render: (p) => <>{p.name}{p.suspicious && <Pill tone="rose" className="ml-1.5"><AlertTriangle className="h-3 w-3" /> check</Pill>}</> },
            { key: 'supplier', label: 'Supplier' },
            { key: 'qty', label: 'Qty', align: 'right', render: (p) => num(p.qty) },
            { key: 'unitCost', label: 'Each', align: 'right', render: (p) => da(p.unitCost) },
            { key: 'total', label: 'Total', align: 'right', render: (p) => da(p.total) },
            { key: 'due', label: 'Unpaid', align: 'right', render: (p) => (p.due ? <span className="text-amber">{da(p.due)}</span> : '—') },
          ]} />
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Customers who owe you" hint="All periods, oldest first. Click to open the order." info="Unpaid balance of every counted order. Age = days since the order was taken.">
          <div className="mb-3 grid grid-cols-4 gap-2">
            {d.rec.buckets.map((b) => (
              <div key={b.key} className={`rounded-xl p-2.5 ${b.min > 30 && b.revenue ? 'bg-rose-soft' : 'bg-cream'}`}>
                <p className="text-[11px] text-muted">{b.label}</p>
                <p className="tabular font-medium text-ink">{da(b.revenue)}</p>
                <p className="text-[11px] text-muted">{num(b.orders)} orders</p>
              </div>
            ))}
          </div>
          <DataTable dense rows={d.rec.orders.map((o) => ({ ...o, key: o.id }))} onRowClick={(o) => open('order', o.id)} exportName="bloom-unpaid-orders" pageSize={8} columns={[
            { key: 'day', label: 'Order', render: (o) => <><p className="font-medium">#{o.number}</p><p className="text-xs text-muted">{daysBetween(o.day, today())} days ago</p></> },
            { key: 'clientName', label: 'Customer', render: (o) => <>{o.clientName || 'Walk-in'}<p className="text-xs text-muted">{o.clientPhone}</p></> },
            { key: 'value', label: 'Total', align: 'right', render: (o) => da(o.value) },
            { key: 'due', label: 'Owes', align: 'right', render: (o) => <span className="font-medium text-amber">{da(o.due)}</span> },
          ]} />
        </Card>
        <Card title="You owe suppliers" hint="Unpaid supplier deliveries, oldest first">
          <p className="tabular mb-3 font-display text-2xl text-ink">{da(d.bills.total)}</p>
          <DataTable dense rows={d.bills.list.map((p) => ({ ...p, key: p.id, name: p.product.name }))} exportName="bloom-unpaid-suppliers" pageSize={8} empty="Nothing unpaid." columns={[
            { key: 'day', label: 'Date', render: (p) => dayLabel(p.day, { day: 'numeric', month: 'short' }) },
            { key: 'supplier', label: 'Supplier' },
            { key: 'name', label: 'Product' },
            { key: 'due', label: 'Unpaid', align: 'right', render: (p) => <span className="text-amber">{da(p.due)}</span> },
          ]} />
          {ds.anomalies.length > 0 && (
            <div className="mt-4 rounded-xl border border-rose/30 bg-rose-soft/50 p-3 text-xs text-rose">
              <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Purchases that look mistyped (left out of costs)</p>
              <ul className="list-disc space-y-0.5 pl-4">{ds.anomalies.map((a) => <li key={a.id}>{a.text}</li>)}</ul>
              <p className="mt-1">Fix them in Blossom → Suppliers and Bloom picks it up on the next refresh.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
