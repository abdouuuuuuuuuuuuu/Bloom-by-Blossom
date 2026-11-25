import { useMemo, useState } from 'react'
import { Flower2, Package, Sparkles, Percent, AlertTriangle } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, BarList, Stat, Pill, Segmented } from '../components/ui.jsx'
import { Sparkline } from '../components/Charts.jsx'
import { DataTable } from '../components/DataTable.jsx'
import * as M from '../model/metrics.js'
import { da, num, ratio, plural } from '../lib/format.js'
import { dayLabel } from '../lib/time.js'

const pid = (k) => (isNaN(k) ? k : Number(k))

export default function Products() {
  const { ds, sel, prevSel, period, filters, setFilter, open, prefs, go } = useApp()
  const [view, setView] = useState('all')

  const d = useMemo(() => ({
    s: M.summary(sel),
    rows: M.productRows(ds, sel, prevSel, { coverDays: prefs.coverDays }),
    categories: M.itemBreakdown(sel, (i) => i.category),
    flowers: M.itemBreakdown(sel, (i) => i.flower),
    colors: M.itemBreakdown(sel, (i) => i.color),
    together: M.boughtTogether(sel),
    slow: M.slowMovers(ds),
  }), [ds, sel, prevSel, prefs.coverDays])

  const rows = useMemo(() => {
    if (view === 'profit') return d.rows.filter((r) => r.profit != null)
    if (view === 'nocost') return d.rows.filter((r) => r.unitCost == null)
    if (view === 'discount') return d.rows.filter((r) => r.discountPct != null && r.discountPct > 0.02)
    if (view === 'rising') return d.rows.filter((r) => r.change != null && r.change > 0.1)
    if (view === 'falling') return d.rows.filter((r) => r.change != null && r.change < -0.1)
    return d.rows
  }, [d.rows, view])

  const top = [...d.rows].filter((r) => r.profit != null).sort((a, b) => b.profit - a.profit)[0]

  return (
    <>
      <PageHeader title="Products" subtitle={`${period.label} · what sells, what earns, what to push`} />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Package} label="Items sold" value={num(d.s.itemsSold)}>{plural(d.s.productsSold, 'product')}</Stat>
        <Stat icon={Sparkles} tone="sage" label="Gross margin" value={ratio(d.s.marginPct)}
          info="(Sales − flower cost) ÷ sales, for items whose cost is known from supplier purchases or Settings.">{d.s.grossProfit ? `${da(d.s.grossProfit)} on costed items` : 'no costs yet'}</Stat>
        <Stat icon={Percent} tone="amber" label="Sales with known cost" value={ratio(d.s.costCoverage)} onClick={() => go('settings')}
          info="Share of product sales where Bloom knows what the item cost you. Add missing costs in Settings.">{d.s.costCoverage < 1 ? 'add missing costs in Settings' : 'all costed'}</Stat>
        <Stat icon={Flower2} tone="rose" label="Most profitable" value={top ? top.name : '—'}>{top ? `${da(top.profit)} profit · ${ratio(top.marginPct)}` : ''}</Stat>
      </div>

      <Card className="mb-4" title="Every product" hint="Click a column to sort, a row for the full story"
        info="Margin = (avg selling price − avg supplier cost) ÷ avg selling price. Price gap = how far below list price it actually sold. Days left = stock ÷ average daily sales of the last 30 days.">
        <DataTable rows={rows} onRowClick={(r) => open('product', r.id)} exportName={`bloom-products-${period.start}`} pageSize={20}
          search={(r) => `${r.name} ${r.category} ${r.flower}`} initialSort={{ key: 'revenue', dir: 'desc' }}
          toolbar={<Segmented label="Show" value={view} onChange={setView} options={[['all', 'All'], ['profit', 'With profit'], ['rising', 'Rising'], ['falling', 'Falling'], ['discount', 'Sold below list'], ['nocost', 'No cost']]} />}
          columns={[
            { key: 'name', label: 'Product', render: (r) => (
              <div className="flex items-center gap-3">
                {r.image ? <img src={r.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-soft text-rose"><Flower2 className="h-4 w-4" /></span>}
                <div className="min-w-0"><p className="truncate font-medium text-ink">{r.name}</p><p className="text-xs text-muted">{r.category}{r.flower && ` · ${r.flower}`}</p></div>
              </div>), csv: (r) => r.name },
            { key: 'qty', label: 'Sold', align: 'right', render: (r) => num(r.qty) },
            { key: 'revenue', label: 'Sales', align: 'right', render: (r) => <>{da(r.revenue)}<p className="text-[11px] text-muted">{ratio(r.share)}</p></> },
            { key: 'change', label: 'vs before', align: 'right', render: (r) => (r.change == null ? <span className="text-xs text-muted">new</span> : <span className={r.change >= 0 ? 'text-sage' : 'text-rose'}>{r.change >= 0 ? '+' : ''}{Math.round(r.change * 100)}%</span>) },
            { key: 'avgPrice', label: 'Avg price', align: 'right', render: (r) => <>{da(r.avgPrice)}{r.discountPct > 0.02 && <p className="text-[11px] text-amber">−{Math.round(r.discountPct * 100)}% vs list</p>}</> },
            { key: 'unitCost', label: 'Cost', align: 'right', render: (r) => (r.unitCost == null ? <span className="text-muted">—</span> : <>{da(r.unitCost)}{r.costSource === 'manual' && <p className="text-[11px] text-muted">set by you</p>}</>) },
            { key: 'marginPct', label: 'Margin', align: 'right', render: (r) => (r.marginPct == null ? '—' : <span className={r.marginPct < 0.3 ? 'text-amber' : 'text-sage'}>{ratio(r.marginPct)}</span>) },
            { key: 'profit', label: 'Profit', align: 'right', render: (r) => (r.profit == null ? '—' : da(r.profit)) },
            { key: 'spark', label: '6 months', sortable: false, csv: (r) => r.spark.join(' '), render: (r) => <Sparkline values={r.spark} /> },
            { key: 'daysCover', label: 'Days left', align: 'right', render: (r) => (!r.stockTracked ? <span className="text-xs text-muted">not tracked</span> : r.stock < 0 ? <Pill tone="rose">below 0</Pill> : r.daysCover == null ? '—' : <span className={r.daysCover < 3 ? 'font-medium text-rose' : r.daysCover < 7 ? 'text-amber' : ''}>{Math.round(r.daysCover)} d</span>) },
          ]} />
      </Card>

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card title="By category" hint="Click to filter everything">
          <BarList rows={d.categories} onSelect={(k) => setFilter('category', k)} active={filters.category} extra={(r) => `${num(r.qty)} items${r.marginPct != null ? ` · ${ratio(r.marginPct)} margin` : ''}`} />
        </Card>
        <Card title="By flower" hint="Click to filter everything">
          <BarList rows={d.flowers} onSelect={(k) => setFilter('flower', k)} active={filters.flower} extra={(r) => `${num(r.qty)} stems${r.marginPct != null ? ` · ${ratio(r.marginPct)} margin` : ''}`} empty="Flower types are not set on these items." />
        </Card>
        <Card title="By colour" info="From the colour saved on the order line or the product.">
          <BarList rows={d.colors} extra={(r) => `${num(r.qty)} items`} empty="Colours are not recorded on these items yet. Set them on products in Blossom to see which colours sell." />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Bought together" info={`${ratio(d.together.multiShare)} of orders have 2 or more different products. "Of A" = how often a buyer of the first product also took the second. Good pairs make good ready-made bundles.`}
          hint="Ideas for bundles and ready-made bouquets">
          <DataTable dense rows={d.together.pairs} pageSize={10} columns={[
            { key: 'pair', label: 'Pair', sortable: false, render: (p) => <span><button className="font-medium hover:text-plum" onClick={() => open('product', p.a.id)}>{p.a.name}</button> <span className="text-muted">+</span> <button className="font-medium hover:text-plum" onClick={() => open('product', p.b.id)}>{p.b.name}</button></span>, csv: (p) => `${p.a.name} + ${p.b.name}` },
            { key: 'orders', label: 'Orders', align: 'right', render: (p) => num(p.orders) },
            { key: 'ofA', label: 'Of A', align: 'right', render: (p) => ratio(p.ofA) },
          ]} />
        </Card>
        <Card title="Not selling" hint="Active products with no sale in 30 days. Promote, bundle or stop buying."
          info="Checked across all your history, not only the selected period. Money tied up = stock × average cost, when both are known.">
          <DataTable dense rows={d.slow} pageSize={10} onRowClick={(r) => open('product', pid(r.key))} exportName="bloom-not-selling" columns={[
            { key: 'name', label: 'Product', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.category}</p></> },
            { key: 'lastSold', label: 'Last sold', render: (r) => (r.lastSold ? dayLabel(r.lastSold, { day: 'numeric', month: 'short' }) : <span className="text-muted">never</span>) },
            { key: 'stock', label: 'Stock', align: 'right', render: (r) => (r.stockTracked ? num(r.stock) : '—') },
            { key: 'tiedUp', label: 'Money tied up', align: 'right', render: (r) => (r.tiedUp == null ? '—' : da(r.tiedUp)) },
          ]} />
          {d.slow.some((r) => r.stock < 0) && <p className="mt-2 flex items-center gap-1 text-xs text-amber"><AlertTriangle className="h-3.5 w-3.5" /> Some show negative stock: recount them.</p>}
        </Card>
      </div>
    </>
  )
}
