import { useMemo, useState } from 'react'
import setupSql from '../../supabase/bloom-back-office.sql?raw'
import { AlertTriangle, CheckCircle2, Lock, Copy, Database } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Pill } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { da, num } from '../lib/format.js'

const input = 'h-9 w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none transition focus:border-plum focus:ring-4 focus:ring-plum/10'

export default function Settings() {
  const { ds, prefs, setPrefs, restricted, status, setupNeeded } = useApp()

  // Products sold in the last 120 days with no cost from supplier purchases.
  const missing = useMemo(() => {
    const sales = new Map()
    for (const i of ds.items) {
      if (!i.order.counted) continue
      const r = sales.get(i.productId) || { qty: 0, revenue: 0 }
      r.qty += i.qty; r.revenue += i.value
      sales.set(i.productId, r)
    }
    return [...ds.products.values()]
      .filter((p) => typeof p.id === 'number' && (p.costSource !== 'purchases') && sales.has(p.id))
      .map((p) => ({ key: String(p.id), product: p, name: p.name, category: p.category, price: p.listPrice, ...sales.get(p.id) }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [ds])

  const setCost = (id, value) => setPrefs((p) => {
    const next = { ...p.costOverrides }
    if (value === '' || value == null) delete next[id]
    else next[id] = Math.max(0, Number(value))
    return { costOverrides: next }
  })

  const shopTarget = ds.dailyTarget

  return (
    <>
      <PageHeader title="Settings" subtitle="Saved on this computer only. Nothing here changes Blossom." />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Targets and planning">
          <label className="block text-sm font-medium">Daily sales target (DA)
            <input type="number" min="0" step="1000" className={`${input} mt-1.5`} placeholder={String(shopTarget || '')}
              value={prefs.dailyTarget ?? ''} onChange={(e) => setPrefs({ dailyTarget: e.target.value === '' ? null : Number(e.target.value) })} />
            <span className="mt-1 block text-xs font-normal text-muted">Leave empty to use Blossom's setting ({da(shopTarget)} a day). A month's target is this × days in the month.</span>
          </label>
          <label className="mt-4 block text-sm font-medium">Reorder for how many days
            <input type="number" min="1" max="60" className={`${input} mt-1.5`} value={prefs.coverDays} onChange={(e) => setPrefs({ coverDays: Math.max(1, Number(e.target.value) || 14) })} />
            <span className="mt-1 block text-xs font-normal text-muted">The shopping list buys enough stock for this many days at the last 30 days' pace.</span>
          </label>
        </Card>
        <Card title="Data health">
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-sage" /> {num(ds.orders.length)} orders, {num(ds.items.length)} order lines, {num(ds.purchases.length)} supplier purchases, {num(ds.expenses.length)} cash-outs loaded{status.loadedAt && ` at ${status.loadedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}.</li>
            {restricted.length > 0 && <li className="flex items-start gap-2 text-amber"><Lock className="mt-0.5 h-4 w-4" /> Not visible to this account: {restricted.join(', ')}. Sign in as an owner to see them.</li>}
            {ds.anomalies.map((a) => <li key={a.id} className="flex items-start gap-2 text-rose"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {a.text} Left out of costs.</li>)}
            {missing.length > 0 && <li className="flex items-start gap-2 text-amber"><AlertTriangle className="mt-0.5 h-4 w-4" /> {missing.filter((m) => m.product.costSource === 'none').length} products that sell have no cost yet. Add them below for exact profit.</li>}
          </ul>
        </Card>
      </div>

      <Card title="Product costs" hint="For items never bought through Suppliers in Blossom (gifts, boxes, decorations…). Type what one unit costs you."
        info="Products with supplier purchases use their average purchase price automatically. A cost typed here replaces it.">
        <DataTable rows={missing} search={(r) => `${r.name} ${r.category}`} pageSize={25} initialSort={{ key: 'revenue', dir: 'desc' }} columns={[
          { key: 'name', label: 'Product', render: (r) => <><p className="font-medium">{r.name}</p><p className="text-xs text-muted">{r.category}</p></> },
          { key: 'qty', label: 'Sold (all time)', align: 'right', render: (r) => num(r.qty) },
          { key: 'revenue', label: 'Sales (all time)', align: 'right', render: (r) => da(r.revenue) },
          { key: 'price', label: 'List price', align: 'right', render: (r) => da(r.price) },
          { key: 'cost', label: 'Cost per unit (DA)', sortable: false, csv: false, render: (r) => (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input type="number" min="0" aria-label={`Cost of ${r.name}`} className={`${input} w-28`} defaultValue={prefs.costOverrides[r.key] ?? ''}
                onBlur={(e) => setCost(r.key, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              {prefs.costOverrides[r.key] != null && r.price > 0 && <Pill tone="sage">{Math.round((1 - prefs.costOverrides[r.key] / r.price) * 100)}% margin</Pill>}
            </div>
          ) },
        ]} />
      </Card>

      <BackOfficeSetup needed={setupNeeded} />
    </>
  )
}

function BackOfficeSetup({ needed }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(setupSql); setCopied(true); setTimeout(() => setCopied(false), 2500) }
  return (
    <section id="setup" className="card rise mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-2xl ${needed ? 'bg-amber-soft text-amber' : 'bg-sage-soft text-sage'}`}><Database className="h-5 w-5" /></span>
          <div>
            <h2 className="font-display text-[17px] text-ink">Back office setup</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] text-muted">{needed
              ? 'Not done yet. Expenses outside the till, staff & payroll, attendance and purchase orders need 6 new tables. Copy the SQL, open Supabase → SQL Editor → New query, paste it and press Run. It only adds tables; the till is not changed. Then press Refresh in Bloom.'
              : 'Done: expenses, staff & payroll, attendance and purchase orders are ready. Running the SQL again is harmless.'}</p>
          </div>
        </div>
        <button onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-plum px-3.5 text-sm font-medium text-white"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy the SQL'}</button>
      </div>
      {needed && <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-ink p-4 text-[11px] leading-relaxed text-white/85">{setupSql}</pre>}
    </section>
  )
}
