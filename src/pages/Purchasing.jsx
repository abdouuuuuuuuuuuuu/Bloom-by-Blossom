import { useMemo, useState } from 'react'
import { Truck, HandCoins, Plus, PackagePlus, ClipboardList, Building2, Phone, Mail, MapPin, Pencil, Ban, RotateCcw, Send, PackageCheck, XCircle, Printer } from 'lucide-react'
import { useApp } from '../state/AppState.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { PageHeader } from '../components/Shell.jsx'
import { Card, Stat, Pill, Segmented, Empty } from '../components/ui.jsx'
import { DataTable } from '../components/DataTable.jsx'
import { Dialog, Field, Input, Textarea, Money, Select, Button, LineEditor, newLine, Confirm, useDialog } from '../components/Form.jsx'
import { SetupNotice } from '../components/SetupNotice.jsx'
import * as A from '../data/actions.js'
import { METHODS, METHOD_LABEL, PO_STATUS, payables } from '../model/backoffice.js'
import { da, num } from '../lib/format.js'
import { addDays, dayLabel, today } from '../lib/time.js'

const short = (d) => (d ? dayLabel(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export default function Purchasing() {
  const { bo, setupNeeded } = useApp()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const [tab, setTab] = useState('suppliers')
  const [selected, setSelected] = useState(null)
  const dlg = useDialog()

  const owing = useMemo(() => payables(bo), [bo])
  const openPOs = bo.purchaseOrders.filter((p) => p.status === 'draft' || p.status === 'sent')
  const supplier = selected != null ? bo.supplierById.get(selected) : null
  const since = addDays(today(), -29)
  const last30 = bo.suppliers.reduce((s, x) => s + x.deliveries.filter((d) => d.day >= since).reduce((t, d) => t + d.total, 0), 0)

  return (
    <>
      <PageHeader title="Purchasing" subtitle="Suppliers, deliveries, what you owe and what you have ordered">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={HandCoins} onClick={() => dlg.open('pay', { supplierId: supplier?.id })}>Pay a supplier</Button>
          <Button variant="outline" icon={ClipboardList} onClick={() => dlg.open('po', { supplierId: supplier?.id })} disabled={setupNeeded}>New purchase order</Button>
          <Button icon={PackagePlus} onClick={() => dlg.open('receive', { supplierId: supplier?.id })} disabled={!isOwner} title={isOwner ? '' : 'Only an owner can receive stock'}>Receive a delivery</Button>
        </div>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={HandCoins} tone="rose" label="You owe suppliers" value={da(owing.total)} info="Everything delivered minus everything paid, for all suppliers (the same balance the till shows in Suppliers).">{num(owing.suppliers.length)} suppliers</Stat>
        <Stat icon={Truck} tone="plum" label="Bought, last 30 days" value={da(last30)} info="Supplier deliveries dated in the last 30 days." />
        <Stat icon={ClipboardList} tone="amber" label="Open purchase orders" value={num(openPOs.length)} onClick={() => setTab('orders')}>{da(openPOs.reduce((s, p) => s + p.total, 0))} expected</Stat>
        <Stat icon={Building2} tone="sage" label="Active suppliers" value={num(bo.suppliers.filter((s) => s.active).length)}>{num(bo.suppliers.filter((s) => !s.active).length)} inactive</Stat>
      </div>

      <div className="mb-4"><Segmented label="View" value={tab} onChange={setTab} options={[['suppliers', 'Suppliers'], ['orders', `Purchase orders (${openPOs.length} open)`], ['deliveries', 'All deliveries'], ['payments', 'Payments']]} /></div>

      {tab === 'suppliers' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card title="Suppliers" hint="Click one to see deliveries and payments" action={<Button variant="outline" icon={Plus} onClick={() => dlg.open('supplier', {})}>Add</Button>}>
            <DataTable dense rows={bo.suppliers.map((s) => ({ ...s, muted: !s.active }))} onRowClick={(s) => setSelected(s.id)} exportName="bloom-suppliers"
              search={(s) => `${s.name} ${s.contact} ${s.phone}`} pageSize={20}
              columns={[
                { key: 'name', label: 'Supplier', render: (s) => <><p className={`font-medium ${selected === s.id ? 'text-plum' : ''}`}>{s.name}</p><p className="text-xs text-muted">{[s.contact, s.phone].filter(Boolean).join(' · ') || (s.active ? '' : 'Inactive')}</p></> },
                { key: 'lastDay', label: 'Last delivery', render: (s) => (s.lastDay ? dayLabel(s.lastDay, { day: 'numeric', month: 'short' }) : '—') },
                { key: 'purchased', label: 'Bought', align: 'right', render: (s) => da(s.purchased) },
                { key: 'due', label: 'You owe', align: 'right', render: (s) => (s.due > 0 ? <span className="font-medium text-rose">{da(s.due)}</span> : s.credit > 0 ? <Pill tone="sage">{da(s.credit)} credit</Pill> : '—') },
              ]} />
          </Card>
          {supplier ? <SupplierPanel s={supplier} isOwner={isOwner} dlg={dlg} /> : (
            <Card><Empty title="Choose a supplier">Their deliveries, payments and contact details show here.</Empty></Card>
          )}
        </div>
      )}

      {tab === 'orders' && (setupNeeded ? <SetupNotice what="Purchase orders" /> : <PurchaseOrders isOwner={isOwner} dlg={dlg} />)}

      {tab === 'deliveries' && (
        <Card title="All deliveries" hint="Every supplier delivery recorded in Blossom">
          <DataTable rows={bo.suppliers.flatMap((s) => s.deliveries).map((d) => ({ ...d, key: d.id, name: d.product.name }))} exportName="bloom-deliveries" initialSort={{ key: 'day', dir: 'desc' }}
            search={(d) => `${d.name} ${d.supplier}`} pageSize={25} columns={[
              { key: 'day', label: 'Date', render: (d) => short(d.day) },
              { key: 'supplier', label: 'Supplier' },
              { key: 'name', label: 'Product', render: (d) => <>{d.name}{d.suspicious && <Pill tone="amber" className="ml-2">check price</Pill>}</> },
              { key: 'qty', label: 'Qty', align: 'right', render: (d) => num(d.qty) },
              { key: 'unitCost', label: 'Unit cost', align: 'right', render: (d) => da(d.unitCost) },
              { key: 'total', label: 'Total', align: 'right', render: (d) => da(d.total) },
              { key: 'status', label: 'Paid', render: (d) => <Pill tone={d.status === 'paid' ? 'sage' : d.status === 'partial' ? 'amber' : 'rose'}>{d.status === 'paid' ? 'Paid' : d.status === 'partial' ? 'Part paid' : 'Unpaid'}</Pill> },
            ]} />
        </Card>
      )}

      {tab === 'payments' && (
        <Card title="Supplier payments">
          <DataTable rows={bo.payments.map((p) => ({ ...p, key: p.id, supplier: bo.supplierById.get(p.supplierId)?.name || '—' }))} exportName="bloom-supplier-payments" initialSort={{ key: 'day', dir: 'desc' }}
            search={(p) => `${p.supplier} ${p.note}`} pageSize={25} columns={[
              { key: 'day', label: 'Date', render: (p) => short(p.day) },
              { key: 'supplier', label: 'Supplier' },
              { key: 'method', label: 'How', render: (p) => METHOD_LABEL[p.method] || p.method },
              { key: 'note', label: 'Note' },
              { key: 'amount', label: 'Amount', align: 'right', render: (p) => da(p.amount) },
            ]} />
        </Card>
      )}

      <Dialogs dlg={dlg} onSupplierSaved={setSelected} />
    </>
  )
}

function SupplierPanel({ s, isOwner, dlg }) {
  const history = [
    ...s.deliveries.map((d) => ({ key: `d${d.id}`, day: d.day, kind: 'delivery', text: `${num(d.qty)} × ${d.product.name}`, sub: `${da(d.unitCost)} each`, amount: d.total, row: d })),
    ...s.payments.map((p) => ({ key: `p${p.id}`, day: p.day, kind: 'payment', text: `Payment · ${METHOD_LABEL[p.method] || p.method}`, sub: p.note, amount: -p.amount })),
  ].sort((a, b) => b.day.localeCompare(a.day))

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[26px] leading-tight text-ink">{s.name} {!s.active && <Pill tone="muted">Inactive</Pill>}</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {s.contact && <span>{s.contact}</span>}
            {s.phone && <a className="inline-flex items-center gap-1 hover:text-plum" href={`tel:${s.phone}`}><Phone className="h-3.5 w-3.5" />{s.phone}</a>}
            {s.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{s.email}</span>}
            {s.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.address}</span>}
          </div>
          {s.notes && <p className="mt-2 text-sm text-ink">{s.notes}</p>}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" icon={Pencil} onClick={() => dlg.open('supplier', s.raw)}>Edit</Button>
          {s.active
            ? <Button variant="ghost" icon={Ban} onClick={() => dlg.open('deactivate', s)}>Deactivate</Button>
            : <Button variant="ghost" icon={RotateCcw} onClick={() => dlg.open('reactivate', s)}>Reactivate</Button>}
        </div>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Mini label="Bought" value={da(s.purchased)} />
        <Mini label="Paid" value={da(s.paid)} />
        <Mini label={s.credit > 0 ? 'Credit' : 'You owe'} value={da(s.credit > 0 ? s.credit : s.due)} tone={s.due > 0 ? 'text-rose' : 'text-sage'} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button icon={PackagePlus} onClick={() => dlg.open('receive', { supplierId: s.id })} disabled={!isOwner || !s.active}>Receive a delivery</Button>
        <Button variant="outline" icon={HandCoins} onClick={() => dlg.open('pay', { supplierId: s.id, amount: s.due })} disabled={!s.active}>Pay</Button>
      </div>
      <h3 className="mb-2 text-[13px] font-medium text-muted">History</h3>
      {history.length ? (
        <ul className="max-h-[440px] divide-y divide-line/60 overflow-y-auto text-sm">
          {history.map((h) => (
            <li key={h.key} className="group flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-ink">{h.text}</p>
                <p className="text-xs text-muted">{short(h.day)}{h.sub ? ` · ${h.sub}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {h.kind === 'delivery' && isOwner && (
                  <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => dlg.open('editDelivery', h.row)} title="Correct this delivery" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => dlg.open('voidDelivery', h.row)} title="Cancel this delivery" className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-rose"><XCircle className="h-3.5 w-3.5" /></button>
                  </span>
                )}
                <span className={`tabular whitespace-nowrap ${h.amount < 0 ? 'text-sage' : 'text-ink'}`}>{h.amount < 0 ? `− ${da(-h.amount)}` : da(h.amount)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="py-6 text-center text-sm text-muted">Nothing recorded with this supplier yet.</p>}
    </Card>
  )
}

function Mini({ label, value, tone = 'text-ink' }) {
  return <div className="rounded-xl bg-cream/70 p-3"><p className="text-xs text-muted">{label}</p><p className={`tabular mt-1 font-display text-lg ${tone}`}>{value}</p></div>
}

function PurchaseOrders({ isOwner, dlg }) {
  const { bo } = useApp()
  const [show, setShow] = useState('open')
  const rows = bo.purchaseOrders.filter((p) => (show === 'open' ? p.status === 'draft' || p.status === 'sent' : true))
  return (
    <Card title="Purchase orders" hint="Plan what to buy, send it to the supplier, then receive it in one click: stock and the supplier’s balance update like a delivery entered at the till."
      action={<Button icon={Plus} onClick={() => dlg.open('po', {})}>New</Button>}>
      <DataTable rows={rows} onRowClick={(p) => dlg.open('poView', p)} exportName="bloom-purchase-orders" search={(p) => `${p.number} ${p.supplier}`}
        toolbar={<Segmented label="Show" value={show} onChange={setShow} options={[['open', 'Open'], ['all', 'All']]} />}
        empty={show === 'open' ? 'No open purchase orders. Start one from the Inventory shopping list or with “New”.' : 'No purchase orders yet.'}
        columns={[
          { key: 'number', label: 'Order', render: (p) => <span className="font-medium">{p.number}</span> },
          { key: 'supplier', label: 'Supplier' },
          { key: 'day', label: 'Created', render: (p) => short(p.day) },
          { key: 'expectedOn', label: 'Expected', render: (p) => short(p.expectedOn) },
          { key: 'units', label: 'Items', align: 'right', render: (p) => `${p.lines.length} · ${num(p.units)} units` },
          { key: 'total', label: 'Total', align: 'right', render: (p) => da(p.total) },
          { key: 'status', label: 'Status', render: (p) => <Pill tone={PO_STATUS[p.status].tone}>{PO_STATUS[p.status].label}</Pill>, csv: (p) => PO_STATUS[p.status].label },
        ]} />
      {!isOwner && <p className="mt-3 text-xs text-muted">Managers can prepare orders; an owner receives them.</p>}
    </Card>
  )
}

// ─── Dialogs ────────────────────────────────────────────────────────────
function Dialogs({ dlg, onSupplierSaved }) {
  const s = dlg.state
  if (!s) return null
  const props = { data: s.data, onClose: dlg.close, dlg }
  switch (s.kind) {
    case 'supplier': return <SupplierDialog {...props} onSaved={onSupplierSaved} />
    case 'pay': return <PayDialog {...props} />
    case 'receive': return <ReceiveDialog {...props} />
    case 'po': return <PurchaseOrderDialog {...props} />
    case 'poView': return <PurchaseOrderView {...props} />
    case 'poReceive': return <ReceiveDialog {...props} po={s.data} />
    case 'editDelivery': return <EditDeliveryDialog {...props} />
    case 'voidDelivery': return <VoidDelivery {...props} />
    case 'deactivate': case 'reactivate': return <ToggleSupplier {...props} activate={s.kind === 'reactivate'} />
    default: return null
  }
}

function SupplierDialog({ data, onClose, onSaved }) {
  const { saved } = useApp()
  const [f, setF] = useState({ company_name: '', contact_person: '', phone: '', email: '', address: '', notes: '', ...data })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  return (
    <Dialog title={f.supplier_id ? 'Edit supplier' : 'New supplier'} onClose={onClose} onSubmit={async () => {
      await A.saveSupplier(f); onClose(); await saved(f.supplier_id ? 'Supplier updated' : 'Supplier added'); if (f.supplier_id) onSaved(f.supplier_id)
    }}>
      <Field label="Company or name"><Input value={f.company_name || ''} onChange={set('company_name')} required maxLength={120} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person"><Input value={f.contact_person || ''} onChange={set('contact_person')} /></Field>
        <Field label="Phone"><Input value={f.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
      </div>
      <Field label="Email"><Input type="email" value={f.email || ''} onChange={set('email')} /></Field>
      <Field label="Address"><Input value={f.address || ''} onChange={set('address')} /></Field>
      <Field label="Notes" hint="Delivery days, payment terms…"><Textarea value={f.notes || ''} onChange={set('notes')} maxLength={500} /></Field>
    </Dialog>
  )
}

function supplierOptions(bo, includeId) {
  return bo.suppliers.filter((s) => s.active || s.id === Number(includeId)).map((s) => ({ value: s.id, label: s.due > 0 ? `${s.name} · owes ${da(s.due)}` : s.name }))
}

function PayDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const [supplierId, setSupplierId] = useState(data?.supplierId ?? '')
  const sup = bo.supplierById.get(Number(supplierId))
  const [amount, setAmount] = useState(data?.amount ? String(Math.round(data.amount)) : '')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  return (
    <Dialog title="Pay a supplier" subtitle="Paid against their oldest unpaid deliveries first" submitLabel={amount ? `Pay ${da(amount)}` : 'Pay'} tone="sage" disabled={!supplierId || !(Number(amount) > 0)}
      onClose={onClose} onSubmit={async () => { await A.paySupplier(supplierId, amount, { method, note }); onClose(); await saved(`Payment of ${da(amount)} recorded`) }}>
      <Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose" options={supplierOptions(bo, supplierId)} /></Field>
      {sup && <p className="-mt-2 text-xs text-muted">Balance now: {sup.due > 0 ? <span className="text-rose">you owe {da(sup.due)}</span> : 'nothing owed'}{sup.due > 0 && <button type="button" onClick={() => setAmount(String(Math.round(sup.due)))} className="ml-2 font-medium text-plum hover:underline">pay all</button>}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount"><Money value={amount} onChange={setAmount} /></Field>
        <Field label="How"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS} /></Field>
      </div>
      <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
      {sup && Number(amount) > sup.due && sup.due > 0 && <p className="text-xs text-amber">That is more than you owe; the rest stays as credit with this supplier.</p>}
    </Dialog>
  )
}

function ReceiveDialog({ data, onClose, po }) {
  const { bo, saved } = useApp()
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? data?.supplierId ?? '')
  const [lines, setLines] = useState(() => (po ? po.lines.map((l) => newLine({ productId: l.productId, quantity: String(l.quantity), unitCost: String(l.unitCost) }))
    : data?.lines?.length ? data.lines.map((l) => newLine(l)) : [newLine()]))
  const [paidNow, setPaidNow] = useState('')
  const [method, setMethod] = useState('cash')
  const [note, setNote] = useState('')
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)
  const valid = supplierId && lines.some((l) => l.productId && Number(l.quantity) > 0)

  const submit = async () => {
    if (po) {
      await A.receivePurchaseOrder(po.id, lines.filter((l) => l.productId))
      if (Number(paidNow) > 0) await A.paySupplier(supplierId, paidNow, { method, note: `${po.number} paid on delivery` })
      onClose(); await saved(`${po.number} received: stock updated`)
    } else {
      await A.receiveDelivery(supplierId, lines, { paidNow, method, note })
      onClose(); await saved(`Delivery of ${da(total)} recorded: stock updated`)
    }
  }

  return (
    <Dialog wide title={po ? `Receive ${po.number}` : 'Receive a delivery'} subtitle="Adds the stock, adds what you owe the supplier, and logs it, exactly like the till’s Suppliers page"
      submitLabel={`Receive ${da(total)}`} disabled={!valid} onClose={onClose} onSubmit={submit}
      footer={po ? 'Change quantities if the delivery was not complete.' : null}>
      <Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose" options={supplierOptions(bo, supplierId)} disabled={!!po} /></Field>
      <LineEditor lines={lines} setLines={setLines} catalogue={bo.catalogue} supplierId={supplierId} />
      <div className="grid grid-cols-3 gap-3 border-t border-line/70 pt-4">
        <Field label="Paid now (optional)"><Money value={paidNow} onChange={setPaidNow} /></Field>
        <Field label="How"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS} /></Field>
        {!po && <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>}
      </div>
      {Number(paidNow) > total && <p className="text-xs text-rose">Paid now is more than the delivery total.</p>}
    </Dialog>
  )
}

function PurchaseOrderDialog({ data, onClose }) {
  const { bo, saved } = useApp()
  const editing = data?.id ? data : null
  const [supplierId, setSupplierId] = useState(editing?.supplierId ?? data?.supplierId ?? '')
  const [expectedOn, setExpectedOn] = useState(editing?.expectedOn ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [lines, setLines] = useState(() => (editing ? editing.lines.map((l) => newLine({ productId: l.productId, quantity: String(l.quantity), unitCost: String(l.unitCost) }))
    : data?.lines?.length ? data.lines.map((l) => newLine(l)) : [newLine()]))
  return (
    <Dialog wide title={editing ? `Edit ${editing.number}` : 'New purchase order'} subtitle="Nothing changes in stock until you receive it"
      submitLabel={editing ? 'Save order' : 'Create order'} disabled={!supplierId || !lines.some((l) => l.productId && Number(l.quantity) > 0)} onClose={onClose}
      onSubmit={async () => { await A.savePurchaseOrder({ id: editing?.id, supplierId, expectedOn, notes, lines }); onClose(); await saved(editing ? 'Purchase order saved' : 'Purchase order created') }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier"><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Choose" options={supplierOptions(bo, supplierId)} /></Field>
        <Field label="Expected on"><Input type="date" value={expectedOn || ''} min={today()} onChange={(e) => setExpectedOn(e.target.value)} /></Field>
      </div>
      <LineEditor lines={lines} setLines={setLines} catalogue={bo.catalogue} supplierId={supplierId} />
      <Field label="Notes for the supplier"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Field>
    </Dialog>
  )
}

function PurchaseOrderView({ data: po, onClose, dlg }) {
  const { saved, bo } = useApp()
  const { profile } = useAuth()
  const [confirm, setConfirm] = useState(null)
  const open = po.status === 'draft' || po.status === 'sent'
  const sup = bo.supplierById.get(po.supplierId)

  const share = () => {
    const text = [`Purchase order ${po.number}`, po.expectedOn ? `For ${short(po.expectedOn)}` : '', '', ...po.lines.map((l) => `${l.quantity} × ${l.name}`), '', po.notes].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n')
    navigator.clipboard?.writeText(text)
    return text
  }

  if (confirm === 'cancel') {
    return <Confirm title={`Cancel ${po.number}?`} confirmLabel="Cancel order" onClose={() => setConfirm(null)}
      onConfirm={async () => { await A.cancelPurchaseOrder(po.id); onClose(); await saved(`${po.number} cancelled`) }}>Nothing was received, so stock does not change.</Confirm>
  }

  return (
    <Dialog wide title={po.number} subtitle={`${po.supplier} · created ${short(po.day)}${po.expectedOn ? ` · expected ${short(po.expectedOn)}` : ''}`} onClose={onClose}
      footer={<Pill tone={PO_STATUS[po.status].tone}>{PO_STATUS[po.status].label}{po.receivedDay ? ` ${short(po.receivedDay)}` : ''}</Pill>}>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted"><th className="py-2 text-left font-medium">Product</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Unit cost</th><th className="py-2 text-right font-medium">Total</th></tr></thead>
        <tbody>{po.lines.map((l) => <tr key={l.id} className="border-t border-line/60"><td className="py-2">{l.name}</td><td className="tabular py-2 text-right">{num(l.quantity)}</td><td className="tabular py-2 text-right">{da(l.unitCost)}</td><td className="tabular py-2 text-right">{da(l.total)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t border-line"><td colSpan={3} className="py-2 text-right text-muted">Total</td><td className="tabular py-2 text-right font-display text-lg">{da(po.total)}</td></tr></tfoot>
      </table>
      {po.notes && <p className="rounded-xl bg-cream/70 p-3 text-sm">{po.notes}</p>}
      <div className="flex flex-wrap gap-2 border-t border-line/70 pt-4">
        {open && profile?.role === 'owner' && <Button tone="sage" icon={PackageCheck} onClick={() => dlg.open('poReceive', po)}>Receive it</Button>}
        {po.status === 'draft' && <Button variant="outline" icon={Send} onClick={async () => { share(); await A.markPurchaseOrderSent(po.id); onClose(); await saved(`${po.number} marked as ordered · list copied, paste it in WhatsApp`) }}>Mark as ordered{sup?.phone ? ' & copy' : ''}</Button>}
        {open && <Button variant="outline" icon={Pencil} onClick={() => dlg.open('po', po)}>Edit</Button>}
        <Button variant="outline" icon={Printer} onClick={() => printPo(po, sup)}>Print</Button>
        {open && <Button variant="ghost" icon={XCircle} onClick={() => setConfirm('cancel')}>Cancel order</Button>}
      </div>
    </Dialog>
  )
}

function printPo(po, sup) {
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) return
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(po.number)}</title>
<style>body{font:14px system-ui;margin:40px;color:#2b2138}h1{font:600 26px Georgia;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}td.n,th.n{text-align:right}.m{color:#7a6f86}</style>
<h1>Purchase order ${esc(po.number)}</h1><p class="m">Blossom · ${esc(short(po.day))}${po.expectedOn ? ` · for ${esc(short(po.expectedOn))}` : ''}</p>
<p><b>${esc(po.supplier)}</b><br>${esc(sup?.contact || '')} ${esc(sup?.phone || '')}</p>
<table><tr><th>Product</th><th class="n">Qty</th><th class="n">Unit cost</th><th class="n">Total</th></tr>
${po.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${l.quantity}</td><td class="n">${esc(da(l.unitCost))}</td><td class="n">${esc(da(l.total))}</td></tr>`).join('')}
<tr><td colspan="3" class="n"><b>Total</b></td><td class="n"><b>${esc(da(po.total))}</b></td></tr></table>
${po.notes ? `<p>${esc(po.notes)}</p>` : ''}<script>print()</script>`)
  w.document.close()
}

function EditDeliveryDialog({ data: d, onClose }) {
  const { saved } = useApp()
  const [qty, setQty] = useState(String(d.qty))
  const [cost, setCost] = useState(String(Math.round(d.unitCost)))
  const [day, setDay] = useState(d.day)
  return (
    <Dialog title="Correct a delivery" subtitle={`${d.product.name} from ${d.supplier}`} onClose={onClose} footer={`New total ${da((Number(qty) || 0) * (Number(cost) || 0))}`}
      onSubmit={async () => {
        await A.editPurchase(d.id, { quantity: Number(qty) !== d.qty ? qty : null, unitCost: Number(cost) !== Math.round(d.unitCost) ? cost : null, date: day !== d.day ? day : null })
        onClose(); await saved('Delivery corrected: stock and balance updated')
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity" hint={`Was ${num(d.qty)}. Stock moves by the difference.`}><Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} /></Field>
        <Field label="Unit cost"><Money value={cost} onChange={setCost} /></Field>
      </div>
      <Field label="Date"><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
    </Dialog>
  )
}

function VoidDelivery({ data: d, onClose }) {
  const { saved } = useApp()
  return (
    <Confirm title="Cancel this delivery?" confirmLabel="Cancel delivery" askReason="Why?" onClose={onClose}
      onConfirm={async (reason) => { await A.voidPurchase(d.id, reason); await saved('Delivery cancelled: stock and balance reversed') }}>
      {num(d.qty)} × {d.product.name} from {d.supplier} on {short(d.day)} ({da(d.total)}). The stock is taken back out and the amount no longer counts as owed.
    </Confirm>
  )
}

function ToggleSupplier({ data: s, onClose, activate }) {
  const { saved } = useApp()
  return (
    <Confirm title={activate ? `Reactivate ${s.name}?` : `Deactivate ${s.name}?`} tone={activate ? 'sage' : 'rose'} confirmLabel={activate ? 'Reactivate' : 'Deactivate'} onClose={onClose}
      onConfirm={async () => { await (activate ? A.reactivateSupplier(s.id) : A.deactivateSupplier(s.id)); await saved(activate ? 'Supplier reactivated' : 'Supplier deactivated') }}>
      {activate ? 'They will show again in the till and in Bloom.' : 'Their history and balance are kept; they just stop showing in lists. You cannot record new deliveries or payments for an inactive supplier.'}
    </Confirm>
  )
}
