import { useMemo, useState } from 'react'
import { Boxes, AlertOctagon, ShoppingCart, Trash2, PackageX } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, Segmented } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { da, num } from '../lib/format.js'
import { dayLabel } from '../lib/time.js'

const STATUS = {
  negative: { label: 'Below zero', tone: 'rose' },
  out: { label: 'Sold out', tone: 'rose' },
  low: { label: 'Reorder', tone: 'amber' },
  ok: { label: 'OK', tone: 'sage' },
  idle: { label: 'Low · not selling', tone: 'muted' },
  empty: { label: 'Empty', tone: 'muted' },
  untracked: { label: 'Not tracked', tone: 'muted' },
}

export default function Stock() {
  const { ds, period, open, prefs } = useApp()
  const [view, setView] = useState('attention')
  const st = useMemo(() => M.stock(ds, period, { coverDays: prefs.coverDays }), [ds, period, prefs.coverDays])

  const rows = view === 'attention' ? st.rows.filter((r) => ['negative', 'out', 'low'].includes(r.status))
    : view === 'tracked' ? st.rows.filter((r) => r.tracked) : st.rows
  const toBuy = st.rows.filter((r) => r.reorder > 0)

  return (
    <>
      <PageHeader title="Stock & waste" subtitle={`What to reorder, what runs out, what gets thrown away · sold, bought and wasted for ${period.label}`} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={ShoppingCart} tone="amber" label="To reorder" value={num(toBuy.length)} info={`Products whose stock covers less than ${prefs.coverDays} days at the last 30 days' pace. Change the number of days in Settings.`}>{toBuy.slice(0, 2).map((r) => r.name).join(', ')}</Stat>
        <Stat icon={AlertOctagon} tone="rose" label="Below zero" value={num(st.counts.negative)} info="Sold more than was received. The stock count in Blossom is wrong: recount and correct.">recount these</Stat>
        <Stat icon={PackageX} tone="muted" label="Not tracked" value={num(st.counts.untracked)} info="Stock set to a placeholder like 9 999, so it is not really counted." />
        <Stat icon={Boxes} tone="plum" label="Stock value" value={da(st.stockValue)} info="Tracked stock × average supplier cost, for products with both." />
        <Stat icon={Trash2} tone="rose" label="Wasted" value={num(st.wasteQty)} info="Wilted or damaged stems recorded in Blossom, valued at average cost.">{st.wasteCost ? da(st.wasteCost) : st.lastWasteDay ? `last logged ${dayLabel(st.lastWasteDay, { day: 'numeric', month: 'short' })}` : 'nothing logged'}</Stat>
      </div>

      <Card className="mb-4" title="Stock levels" hint="Click a product for its sales and purchases"
        info={`Per day = average units sold per day over the last 30 days. Days left = stock ÷ per day. Reorder = enough for ${prefs.coverDays} days minus what you have.`}>
        <DataTable rows={rows} onRowClick={(r) => open('product', r.id)} exportName="bloom-stock" search={(r) => `${r.name} ${r.category}`} pageSize={25}
          toolbar={<Segmented label="Show" value={view} onChange={setView} options={[['attention', `Needs attention (${st.counts.negative + st.counts.out + st.counts.low})`], ['tracked', 'Tracked'], ['all', 'All']]} />}
          columns={[
            { key: 'name', label: 'Product', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.category}</p></> },
            { key: 'status', label: 'Status', sort: (r) => ['negative', 'out', 'low', 'ok', 'idle', 'empty', 'untracked'].indexOf(r.status), render: (r) => <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>, csv: (r) => STATUS[r.status].label },
            { key: 'stock', label: 'In stock', align: 'right', render: (r) => (r.tracked ? <span className={r.stock < 0 ? 'text-rose' : ''}>{num(r.stock)}</span> : <span className="text-muted">{num(r.stock)}</span>) },
            { key: 'perDay', label: 'Per day', align: 'right', render: (r) => (r.perDay ? r.perDay.toFixed(1) : '—') },
            { key: 'daysCover', label: 'Days left', align: 'right', render: (r) => (r.daysCover == null ? '—' : <span className={r.daysCover < 3 ? 'font-medium text-rose' : r.daysCover < 7 ? 'text-amber' : ''}>{Math.round(r.daysCover)}</span>) },
            { key: 'reorder', label: 'Reorder', align: 'right', render: (r) => (r.reorder ? <span className="font-medium text-plum">{num(r.reorder)}</span> : '—') },
            { key: 'bought', label: 'Bought', align: 'right', render: (r) => num(r.bought) },
            { key: 'sold', label: 'Sold', align: 'right', render: (r) => num(r.sold) },
            { key: 'wasted', label: 'Wasted', align: 'right', render: (r) => (r.wasted ? <span className="text-rose">{num(r.wasted)}</span> : '—') },
          ]} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Shopping list" hint={`Enough for ${prefs.coverDays} days at the current pace`}>
          <DataTable dense rows={toBuy} onRowClick={(r) => open('product', r.id)} exportName="bloom-shopping-list" initialSort={{ key: 'daysCover', dir: 'asc' }} empty="Nothing to reorder." columns={[
            { key: 'name', label: 'Product' },
            { key: 'daysCover', label: 'Days left', align: 'right', render: (r) => (r.daysCover == null ? '—' : Math.round(r.daysCover)) },
            { key: 'reorder', label: 'Buy', align: 'right', render: (r) => <span className="font-medium text-plum">{num(r.reorder)}</span> },
            { key: 'cost', label: 'About', align: 'right', sort: (r) => (r.unitCost ?? 0) * r.reorder, render: (r) => (r.unitCost == null ? '—' : da(r.unitCost * r.reorder)) },
          ]} />
        </Card>
        <Card title="Waste log" hint={period.label}>
          <DataTable dense rows={st.waste.map((w) => ({ ...w, key: w.id, name: w.product.name }))} onRowClick={(w) => open('product', w.productId)} exportName={`bloom-waste-${period.start}`} empty="No waste recorded in this period. If stems were thrown away, log them in Blossom so the loss shows here." columns={[
            { key: 'day', label: 'Date', render: (w) => dayLabel(w.day, { day: 'numeric', month: 'short' }) },
            { key: 'name', label: 'Product' },
            { key: 'reason', label: 'Why' },
            { key: 'qty', label: 'Qty', align: 'right', render: (w) => num(w.qty) },
            { key: 'cost', label: 'Lost', align: 'right', render: (w) => (w.cost == null ? '—' : da(w.cost)) },
          ]} />
        </Card>
      </div>
    </>
  )
}
