import { useMemo, useState } from 'react'
import { Boxes, AlertOctagon, ShoppingCart, Trash2, PackageX, ClipboardCheck, Settings2, ClipboardList } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, Segmented } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { Dialog, Field, Input, Money, Select, Button, Toggle, useDialog } from '../components/Form.jsx'
import * as A from '../data/actions.js'
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

const digits = (v) => v.replace(/[^\d]/g, '')

export default function Stock() {
  const { ds, period, open, prefs, setupNeeded } = useApp()
  const [view, setView] = useState('attention')
  const dlg = useDialog()
  const st = useMemo(() => M.stock(ds, period, { coverDays: prefs.coverDays }), [ds, period, prefs.coverDays])

  const rows = view === 'attention' ? st.rows.filter((r) => ['negative', 'out', 'low'].includes(r.status))
    : view === 'tracked' ? st.rows.filter((r) => r.tracked) : st.rows
  const toBuy = st.rows.filter((r) => r.reorder > 0)

  return (
    <>
      <PageHeader title="Inventory" subtitle={`Count, correct and reorder stock · sold, bought and wasted for ${period.label}`}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={Trash2} onClick={() => dlg.open('waste', {})}>Log waste</Button>
          <Button variant="outline" icon={ClipboardCheck} onClick={() => dlg.open('count', {})}>Count stock</Button>
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat icon={ShoppingCart} tone="amber" label="To reorder" value={num(toBuy.length)} info={`Products whose stock covers less than ${prefs.coverDays} days at the last 30 days' pace. Change the number of days in Settings.`}>{toBuy.slice(0, 2).map((r) => r.name).join(', ')}</Stat>
        <Stat icon={AlertOctagon} tone="rose" label="Below zero" value={num(st.counts.negative)} info="Sold more than was received. The stock count is wrong: count it and correct it here.">recount these</Stat>
        <Stat icon={PackageX} tone="muted" label="Not tracked" value={num(st.counts.untracked)} info="Stock set to a placeholder like 9 999, so it is not really counted." />
        <Stat icon={Boxes} tone="plum" label="Stock value" value={da(st.stockValue)} info="Tracked stock × average supplier cost, for products with both." />
        <Stat icon={Trash2} tone="rose" label="Wasted" value={num(st.wasteQty)} info="Wilted or damaged stems logged, valued at average cost.">{st.wasteCost ? da(st.wasteCost) : st.lastWasteDay ? `last logged ${dayLabel(st.lastWasteDay, { day: 'numeric', month: 'short' })}` : 'nothing logged'}</Stat>
      </div>

      <Card className="mb-4" title="Stock levels" hint="Click a product for its sales and purchases · use the buttons on the right to count, log waste or change its settings"
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
            { key: 'act', label: '', sortable: false, csv: false, render: (r) => (
              <span className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => dlg.open('count', { productId: r.id })} title="Count / correct stock" aria-label={`Count ${r.name}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><ClipboardCheck className="h-4 w-4" /></button>
                <button onClick={() => dlg.open('waste', { productId: r.id })} title="Log waste" aria-label={`Log waste for ${r.name}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-rose"><Trash2 className="h-4 w-4" /></button>
                <button onClick={() => dlg.open('settings', { productId: r.id })} title="Price, reorder level, supplier" aria-label={`Settings for ${r.name}`} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><Settings2 className="h-4 w-4" /></button>
              </span>) },
          ]} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Shopping list" hint={`Enough for ${prefs.coverDays} days at the current pace`}
          action={toBuy.length > 0 && <Button variant="outline" icon={ClipboardList} disabled={setupNeeded} title={setupNeeded ? 'Run the back-office setup first (Settings)' : ''} onClick={() => dlg.open('orders', {})}>Make purchase orders</Button>}>
          <DataTable dense rows={toBuy} onRowClick={(r) => open('product', r.id)} exportName="bloom-shopping-list" initialSort={{ key: 'daysCover', dir: 'asc' }} empty="Nothing to reorder." columns={[
            { key: 'name', label: 'Product' },
            { key: 'daysCover', label: 'Days left', align: 'right', render: (r) => (r.daysCover == null ? '—' : Math.round(r.daysCover)) },
            { key: 'reorder', label: 'Buy', align: 'right', render: (r) => <span className="font-medium text-plum">{num(r.reorder)}</span> },
            { key: 'cost', label: 'About', align: 'right', sort: (r) => (r.unitCost ?? 0) * r.reorder, render: (r) => (r.unitCost == null ? '—' : da(r.unitCost * r.reorder)) },
          ]} />
        </Card>
        <Card title="Waste log" hint={period.label} action={<Button variant="ghost" icon={Trash2} onClick={() => dlg.open('waste', {})}>Log waste</Button>}>
          <DataTable dense rows={st.waste.map((w) => ({ ...w, key: w.id, name: w.product.name }))} onRowClick={(w) => open('product', w.productId)} exportName={`bloom-waste-${period.start}`} empty="No waste logged in this period." columns={[
            { key: 'day', label: 'Date', render: (w) => dayLabel(w.day, { day: 'numeric', month: 'short' }) },
            { key: 'name', label: 'Product' },
            { key: 'reason', label: 'Why' },
            { key: 'qty', label: 'Qty', align: 'right', render: (w) => num(w.qty) },
            { key: 'cost', label: 'Lost', align: 'right', render: (w) => (w.cost == null ? '—' : da(w.cost)) },
          ]} />
        </Card>
      </div>

      {dlg.is('count') && <CountDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('waste') && <WasteDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('settings') && <ProductDialog data={dlg.state.data} onClose={dlg.close} />}
      {dlg.is('orders') && <MakeOrdersDialog toBuy={toBuy} onClose={dlg.close} />}
    </>
  )
}

function productOptions(bo) {
  return bo.catalogue.filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.name}${p.stock != null ? ` · ${num(p.stock)} in stock` : ''}` }))
}

function CountDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const [productId, setProductId] = useState(data?.productId ?? '')
  const p = bo.productById.get(Number(productId))
  const [counted, setCounted] = useState('')
  const [reason, setReason] = useState('Stock count')
  const diff = p && counted !== '' ? Number(counted) - (p.stock ?? 0) : null
  return (
    <Dialog title="Count stock" subtitle="Enter what is really on the shelf. The till’s number is replaced and the difference is logged." onClose={onClose}
      submitLabel="Save the count" disabled={!p || counted === ''}
      onSubmit={async () => { await A.setStock(p.id, p.stock ?? 0, Number(counted), reason); onClose(); await saved(`${p.name}: stock set to ${num(counted)}`) }}>
      <Field label="Product"><Select value={productId} onChange={(e) => { setProductId(e.target.value); setCounted('') }} placeholder="Choose" options={productOptions(bo)} /></Field>
      {p && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cream/70 p-3"><p className="text-xs text-muted">The till says</p><p className="tabular font-display text-2xl">{num(p.stock ?? 0)}</p>{!p.tracked && <p className="text-xs text-amber">placeholder, not really counted</p>}</div>
          <Field label="You counted"><Input inputMode="numeric" value={counted} onChange={(e) => setCounted(digits(e.target.value))} className="h-12 text-lg" /></Field>
        </div>
      )}
      {diff != null && diff !== 0 && <p className={`text-sm ${diff < 0 ? 'text-rose' : 'text-sage'}`}>{diff > 0 ? '+' : ''}{num(diff)} {Math.abs(diff) === 1 ? 'unit' : 'units'}{p.avgCost != null ? ` · about ${da(Math.abs(diff) * p.avgCost)}` : ''}</p>}
      <Field label="Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)} options={['Stock count', 'Friday count', 'Correction after a mistake', 'Found stock'].map((x) => [x, x])} /></Field>
    </Dialog>
  )
}

const WASTE_REASONS = ['Wilted', 'Broken / damaged', 'Arrived bad', 'Expired', 'Used for display', 'Other']

function WasteDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const [productId, setProductId] = useState(data?.productId ?? '')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('Wilted')
  const p = bo.productById.get(Number(productId))
  return (
    <Dialog title="Log waste" subtitle="Takes the stems out of stock and counts their cost as a loss" tone="rose" submitLabel="Log waste" disabled={!p || !(Number(qty) > 0)} onClose={onClose}
      onSubmit={async () => { await A.recordWaste(p.id, qty, reason); onClose(); await saved(`${num(qty)} × ${p.name} logged as waste`) }}>
      <Field label="Product"><Select value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="Choose" options={productOptions(bo)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="How many" hint={p?.stock != null ? `${num(p.stock)} in stock` : ''}><Input inputMode="numeric" value={qty} onChange={(e) => setQty(digits(e.target.value))} /></Field>
        <Field label="Why"><Select value={reason} onChange={(e) => setReason(e.target.value)} options={WASTE_REASONS.map((x) => [x, x])} /></Field>
      </div>
      {p?.avgCost != null && Number(qty) > 0 && <p className="text-sm text-rose">Loss of about {da(Number(qty) * p.avgCost)}</p>}
    </Dialog>
  )
}

function ProductDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const p = bo.productById.get(Number(data.productId))
  const [price, setPrice] = useState(String(p?.listPrice ?? ''))
  const [low, setLow] = useState(String(p?.lowStock ?? 0))
  const [supplierId, setSupplierId] = useState(p?.defaultSupplierId ?? '')
  const [active, setActive] = useState(p?.active !== false)
  if (!p) return null
  const margin = p.avgCost != null && Number(price) > 0 ? (Number(price) - p.avgCost) / Number(price) : null
  return (
    <Dialog title={p.name} subtitle={p.category} onClose={onClose}
      onSubmit={async () => { await A.saveProduct(p.id, { retail_price: price, low_stock_threshold: low, supplier_id: supplierId || null, is_active: active }); onClose(); await saved(`${p.name} saved`) }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Selling price" hint={margin == null ? 'No supplier cost yet' : `Cost ≈ ${da(p.avgCost)} · margin ${Math.round(margin * 100)}%`}><Money value={price} onChange={setPrice} /></Field>
        <Field label="Reorder at or below"><Input inputMode="numeric" value={low} onChange={(e) => setLow(digits(e.target.value))} /></Field>
      </div>
      <Field label="Usual supplier" hint="Used when making purchase orders from the shopping list"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="None" options={bo.suppliers.filter((s) => s.active).map((s) => [s.id, s.name])} /></Field>
      <Toggle checked={active} onChange={setActive} label="On sale" hint="Turn off to hide it from the till. Its history stays." />
      <p className="text-xs text-muted">The price changes at the till too. Name, photo and category are edited in Blossom.</p>
    </Dialog>
  )
}

/** Shopping list → one draft purchase order per supplier. */
function MakeOrdersDialog({ toBuy, onClose }) {
  const { bo, saved, go } = useApp()
  const groups = new Map()
  const unknown = []
  for (const r of toBuy) {
    const p = bo.productById.get(r.id)
    const sid = p?.defaultSupplierId ?? p?.lastSupplierId
    if (!sid || !bo.supplierById.get(sid)?.active) { unknown.push(r); continue }
    if (!groups.has(sid)) groups.set(sid, [])
    groups.get(sid).push({ productId: r.id, name: r.name, quantity: r.reorder, unitCost: Math.round(p?.lastCost ?? p?.avgCost ?? 0) })
  }
  const plural = groups.size === 1 ? '' : 's'
  return (
    <Dialog wide title="Make purchase orders" subtitle="One draft per supplier, from the shopping list. You can change them before ordering." submitLabel={`Create ${groups.size} draft${plural}`} disabled={!groups.size} onClose={onClose}
      onSubmit={async () => {
        for (const [supplierId, lines] of groups) await A.savePurchaseOrder({ supplierId, lines })
        onClose(); await saved(`${groups.size} purchase order${plural} created`); go('purchasing')
      }}>
      {[...groups].map(([sid, lines]) => (
        <div key={sid} className="rounded-xl border border-line p-3">
          <p className="mb-1 font-medium text-ink">{bo.supplierById.get(sid).name}</p>
          <ul className="text-sm text-muted">{lines.map((l) => <li key={l.productId} className="flex justify-between"><span>{num(l.quantity)} × {l.name}</span><span className="tabular">{da(l.quantity * l.unitCost)}</span></li>)}</ul>
        </div>
      ))}
      {unknown.length > 0 && <p className="text-sm text-amber">No supplier known for: {unknown.map((r) => r.name).join(', ')}. Set a usual supplier with the settings button in the stock table, or add them to an order by hand.</p>}
    </Dialog>
  )
}
