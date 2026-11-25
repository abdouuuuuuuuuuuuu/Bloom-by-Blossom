import { useEffect, useRef, useState } from "react"
import {
  Phone, MessageCircle, MapPin, CalendarClock, Wallet, MoreHorizontal, Check, ChefHat, Bike, PackageCheck, Ban, StickyNote, Flower2, CircleAlert,
} from 'lucide-react'
import { api } from '../api/index.js'
import { useApp } from '../state/app.jsx'
import { Screen, Section, Button, Pill, Sheet, Field, Choice, inputClass, Skeleton, Empty } from '../components/ui.jsx'
import { FulfilmentIcon } from '../components/OrderCard.jsx'
import { can } from '../lib/permissions.js'
import { da } from '../lib/format.js'
import { PAYMENT_METHODS, PAY_STATUS, fulfilmentLabel, paymentLabel, sourceLabel, tidyName } from '../lib/labels.js'
import { formatDateTime, longDay, relativeDay, shortTime, today } from '../lib/time.js'
import { isCancelled, isDelivery, isQuick, isOpen, stage, urgency } from '../lib/orders.js'
import { whatsappNumber } from '../lib/orderDraft.js'

export default function OrderDetail({ id }) {
  const { orders, role, reloadOrder, notify, online } = useApp()
  const cached = orders?.find((o) => o.id === id)
  const [order, setOrder] = useState(cached || null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(null)
  const [sheet, setSheet] = useState(null) // 'pay' | 'date' | 'cancel' | 'more'

  useEffect(() => { if (cached) setOrder(cached) }, [cached])
  useEffect(() => {
    let alive = true
    reloadOrder(id).then((o) => { if (!alive) return; if (o) setOrder(o); else setMissing(true) }).catch(() => {})
    return () => { alive = false }
  }, [id, reloadOrder])

  const back = () => (history.length > 1 ? history.back() : (location.hash = '#/orders'))
  if (missing) return <Screen title="Order" back={back}><Empty icon={CircleAlert} title="Order not found">It may have been archived on the PC.</Empty></Screen>
  if (!order) return <Screen title="Order" back={back}><div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-48" /></div></Screen>

  const o = order
  const rights = can(role)
  const s = stage(o)

  /** Runs one server action, then shows the fresh order. */
  const act = async (key, fn, done) => {
    if (!online) return notify('No internet. Try again when you are connected.', 'warn')
    setBusy(key)
    try {
      await fn()
      const fresh = await reloadOrder(o.id)
      if (fresh) setOrder(fresh)
      setSheet(null)
      notify(done)
    } catch (err) {
      notify(err.message || 'Could not save. Try again.', 'bad')
    } finally {
      setBusy(null)
    }
  }

  // The one next step, depending on where the order is and who you are.
  let next = null
  if (!isCancelled(o)) {
    if (s.key === 'new' && !rights.status && rights.deliver && isDelivery(o)) next = { key: 'courier', label: 'Hand to courier', icon: Bike, run: () => api.markHandedOff(o.id), done: 'Handed to the courier.' }
    else if (s.key === 'new' && rights.status) next ={ key: 'prep', label: 'Start preparing', icon: ChefHat, run: () => api.setStatus(o.id, 'processing'), done: 'Marked as preparing.' }
    else if (s.key === 'preparing' && !isDelivery(o) && rights.status) next = { key: 'collect', label: 'Mark as collected', icon: PackageCheck, run: () => api.setStatus(o.id, 'done'), done: 'Order done.' }
    else if (s.key === 'preparing' && isDelivery(o) && rights.deliver) next = { key: 'courier', label: 'Hand to courier', icon: Bike, run: () => api.markHandedOff(o.id), done: 'Handed to the courier.' }
    else if (s.key === 'courier' && rights.deliver) next = { key: 'delivered', label: 'Mark as delivered', icon: Check, run: () => api.markDelivered(o.id), done: 'Delivered. Thank you!' }
  }

  const steps = isDelivery(o) ? ['New', 'Preparing', 'With courier', 'Delivered'] : isQuick(o) ? null : ['New', 'Preparing', 'Collected']
  const u = urgency(o)
  const phone = o.client_phone
  const wa = whatsappNumber(phone)
  const mapsUrl = o.delivery_latitude && o.delivery_longitude
    ? `https://www.google.com/maps/search/?api=1&query=${o.delivery_latitude},${o.delivery_longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([o.delivery_city, o.delivery_wilaya, 'Algérie'].filter(Boolean).join(', '))}`
  const subtotal = (o.items || []).reduce((sum, i) => sum + Number(i.total_price || 0), 0)
  const adjustment = Number(o.price_adjustment || 0)
  const pay = PAY_STATUS[o.payment_status]
  const hasMore = rights.status || rights.cancel

  return (
    <Screen title={`Order #${o.order_number}`} subtitle={`${isQuick(o) ? 'Counter sale' : sourceLabel(o.client_source)} · taken ${formatDateTime(o.created_at)}`} back={back}
      actions={hasMore && !isCancelled(o) && <button onClick={() => setSheet('more')} aria-label="More actions" className="grid h-10 w-10 place-items-center rounded-full text-plum active:bg-plum-soft"><MoreHorizontal className="h-6 w-6" /></button>}>

      {/* Customer + progress */}
      <div className="card rise mb-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-[24px] leading-tight text-ink">{isQuick(o) && /walk-?in/i.test(o.client_name || '') ? 'Counter sale' : o.client_name}</p>
            {phone && <p className="tabular mt-0.5 text-sm text-muted">{phone}</p>}
          </div>
          {isCancelled(o) ? <Pill tone="rose">Cancelled</Pill> : u === 'late' ? <Pill tone="rose">Late</Pill> : u === 'today' ? <Pill tone="solid">Today</Pill> : null}
        </div>
        {phone && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="press flex h-11 items-center justify-center gap-2 rounded-2xl bg-plum-soft text-sm font-semibold text-plum"><Phone className="h-4 w-4" /> Call</a>
            {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="press flex h-11 items-center justify-center gap-2 rounded-2xl bg-sage-soft text-sm font-semibold text-sage"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
          </div>
        )}
        {steps && !isCancelled(o) && (
          <ol className="mt-4 flex items-center gap-1" aria-label="Progress">
            {steps.map((label, i) => (
              <li key={label} className="flex flex-1 flex-col items-center gap-1 text-center">
                <span className={`h-1.5 w-full rounded-full ${i <= s.step ? 'bg-plum' : 'bg-plum-soft'}`} />
                <span className={`text-[10px] font-semibold ${i === s.step ? 'text-plum' : 'text-muted'}`}>{label}</span>
              </li>
            ))}
          </ol>
        )}
        {o.voided_at && <p className="mt-3 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">Cancelled{o.void_reason ? `: ${o.void_reason}` : ''}.</p>}
      </div>

      {next && (
        <Button size="lg" icon={next.icon} busy={busy === next.key} className="mb-5 w-full" onClick={() => act(next.key, next.run, next.done)}>{next.label}</Button>
      )}

      {/* When & where */}
      {!isQuick(o) && (
        <Section title="When & where">
          <div className="card divide-y divide-line/70">
            <Row icon={CalendarClock} title={o.delivery_date ? `${relativeDay(o.delivery_date)}${o.delivery_time ? ` at ${shortTime(o.delivery_time)}` : ''}` : 'No date set'}
              sub={o.delivery_date ? longDay(o.delivery_date) : 'Pickup whenever the customer comes'}
              action={rights.status && isOpen(o) && <button onClick={() => setSheet('date')} className="text-sm font-semibold text-plum">Change</button>} />
            <Row icon={() => <FulfilmentIcon order={o} className="h-5 w-5" />} title={fulfilmentLabel(o.delivery_method)}
              sub={isDelivery(o) ? [o.delivery_city, o.delivery_wilaya].filter(Boolean).join(', ') || 'Address not set' : 'At the shop'}
              action={isDelivery(o) && (o.delivery_city || o.delivery_latitude) && <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-plum"><MapPin className="h-4 w-4" /> Maps</a>} />
          </div>
        </Section>
      )}

      {/* Items */}
      <Section title={`Items · ${(o.items || []).reduce((sum, i) => sum + i.quantity, 0)}`}>
        <ul className="card divide-y divide-line/70">
          {(o.items || []).map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              {i.product_image ? <img src={i.product_image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-soft text-rose"><Flower2 className="h-5 w-5" /></span>}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink"><span className="tabular text-plum">{i.quantity}×</span> {tidyName(i.product_name)}</p>
                <p className="tabular text-xs text-muted">{da(i.unit_price)} each</p>
              </div>
              <p className="tabular shrink-0 font-semibold">{da(i.total_price)}</p>
            </li>
          ))}
          {!o.items?.length && <li className="px-4 py-4 text-sm text-muted">No items recorded.</li>}
          {adjustment !== 0 && (
            <li className="flex justify-between px-4 py-2.5 text-sm"><span className="text-muted">{adjustment < 0 ? 'Discount' : 'Extra charge'}</span><span className="tabular">{adjustment < 0 ? '−' : '+'}{da(Math.abs(adjustment))}</span></li>
          )}
          <li className="flex justify-between px-4 py-3"><span className="font-semibold">Total</span><span className="tabular font-display text-xl">{da(o.total_amount)}</span></li>
        </ul>
        {adjustment === 0 && subtotal !== Number(o.total_amount) && o.items?.length > 0 && <p className="mt-1 px-1 text-xs text-muted">Total includes changes made on the PC.</p>}
      </Section>

      {/* Payment */}
      <Section title="Payment">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">{paymentLabel(o.payment_method)} · paid</p>
              <p className="tabular font-display text-[22px] text-ink">{da(o.amount_paid)}</p>
            </div>
            {pay && <Pill tone={pay.tone}>{pay.label}</Pill>}
          </div>
          {Number(o.amount_due) > 0 && !isCancelled(o) && (
            <>
              <p className="tabular mt-2 text-sm font-semibold text-rose">Still owes {da(o.amount_due)}</p>
              {rights.payment && <Button variant="secondary" icon={Wallet} className="mt-3 w-full" onClick={() => setSheet('pay')}>Take payment</Button>}
            </>
          )}
        </div>
      </Section>

      {o.notes && (
        <Section title="Notes">
          <p className="card flex gap-3 p-4 text-[15px] leading-relaxed text-ink"><StickyNote className="mt-0.5 h-5 w-5 shrink-0 text-amber" />{o.notes}</p>
        </Section>
      )}

      <PaySheet open={sheet === 'pay'} order={o} busy={busy === 'pay'} onClose={() => setSheet(null)}
        onSave={(amount, method, requestId) => act('pay', () => api.recordPayment({ orderId: o.id, amount, method, requestId }), `Payment of ${da(amount)} recorded.`)} />
      <DateSheet open={sheet === 'date'} order={o} busy={busy === 'date'} onClose={() => setSheet(null)}
        onSave={(date, reason) => act('date', () => api.reschedule(o.id, date, reason), `Moved to ${relativeDay(date)}.`)} />
      <CancelSheet open={sheet === 'cancel'} busy={busy === 'cancel'} onClose={() => setSheet(null)}
        onSave={(reason) => act('cancel', () => api.cancelOrder(o.id, reason), 'Order cancelled.')} />
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title={`Order #${o.order_number}`}>
        <div className="space-y-2">
          {rights.status && isOpen(o) && s.key !== 'new' && !o.delivery_handed_off_at && (
            <Button variant="outline" className="w-full justify-start" busy={busy === 'back'} onClick={() => act('back', () => api.setStatus(o.id, 'new'), 'Moved back to New.')}>Move back to New</Button>
          )}
          {rights.status && isOpen(o) && (
            <Button variant="outline" className="w-full justify-start" busy={busy === 'done'} onClick={() => act('done', () => api.setStatus(o.id, 'done'), 'Order done.')}>Mark as done</Button>
          )}
          {rights.status && isOpen(o) && <Button variant="outline" icon={CalendarClock} className="w-full justify-start" onClick={() => setSheet('date')}>Change date</Button>}
          {rights.cancel && <Button variant="danger" icon={Ban} className="w-full justify-start" onClick={() => setSheet('cancel')}>Cancel order</Button>}
          <p className="pt-2 text-xs text-muted">Editing items, refunds and printing stay on the shop PC.</p>
        </div>
      </Sheet>
    </Screen>
  )
}

function Row({ icon: Icon, title, sub, action }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-plum-soft text-plum"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{title}</p>{sub && <p className="truncate text-sm text-muted">{sub}</p>}</div>
      {action}
    </div>
  )
}

function PaySheet({ open, order, busy, onClose, onSave }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const requestId = useRef(null)
  useEffect(() => {
    if (open) { setAmount(String(order.amount_due)); setMethod(order.payment_method || 'cash'); requestId.current = api.newRequestId() }
  }, [open, order.amount_due, order.payment_method])
  const value = Math.round(Number(amount) || 0)
  const error = value <= 0 ? 'Enter the amount received.' : value > Number(order.amount_due) ? `That is more than the ${da(order.amount_due)} still owed.` : ''
  return (
    <Sheet open={open} onClose={onClose} title="Take payment">
      <div className="space-y-4">
        <Field label="Amount received (DA)" error={amount !== '' && error}>
          <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass(amount !== '' && error)} tabular text-lg font-semibold`} />
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAmount(String(order.amount_due))}>All {da(order.amount_due)}</Button>
          {Number(order.amount_due) >= 2000 && <Button variant="secondary" size="sm" onClick={() => setAmount(String(Math.round(Number(order.amount_due) / 2)))}>Half</Button>}
        </div>
        <Field label="Paid with"><Choice label="Paid with" options={PAYMENT_METHODS} value={method} onChange={setMethod} columns={3} /></Field>
        <Button size="lg" className="w-full" busy={busy} disabled={Boolean(error)} onClick={() => onSave(value, method, requestId.current)}>Record {value > 0 ? da(value) : 'payment'}</Button>
      </div>
    </Sheet>
  )
}

const REASONS = ['Customer asked', 'Flowers not ready', 'Courier unavailable', 'Customer not reachable']

function DateSheet({ open, order, busy, onClose, onSave }) {
  const [date, setDate] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  useEffect(() => { if (open) { setDate(order.delivery_date || today()); setReason(REASONS[0]) } }, [open, order.delivery_date])
  const t = today()
  const error = !date ? 'Pick a date.' : date < t ? 'Choose today or a later date.' : date === order.delivery_date ? 'Pick a different date.' : ''
  const quick = [0, 1, 2].map((n) => { const d = new Date(`${t}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) })
  return (
    <Sheet open={open} onClose={onClose} title="Change date">
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {quick.map((d) => <button key={d} onClick={() => setDate(d)} className={`press rounded-2xl border px-2 py-2.5 text-sm font-semibold ${date === d ? 'border-plum bg-plum text-white' : 'border-line bg-paper'}`}>{relativeDay(d)}</button>)}
        </div>
        <Field label="Or pick a day" error={error && date ? error : ''}><input type="date" min={t} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass()} /></Field>
        <Field label="Why"><Choice label="Why" options={REASONS.map((r) => ({ id: r, label: r }))} value={reason} onChange={setReason} /></Field>
        <Button size="lg" className="w-full" busy={busy} disabled={Boolean(error)} onClick={() => onSave(date, reason)}>Move to {date ? relativeDay(date) : '…'}</Button>
      </div>
    </Sheet>
  )
}

function CancelSheet({ open, busy, onClose, onSave }) {
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Sheet open={open} onClose={onClose} title="Cancel this order?">
      <div className="space-y-4">
        <p className="text-sm text-muted">The order stops counting as a sale, and its payments are reversed in the register. An owner or manager can undo it on the PC for a short time.</p>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer changed their mind" className={inputClass()} /></Field>
        <Button variant="danger" size="lg" className="w-full" busy={busy} disabled={!reason.trim()} onClick={() => onSave(reason.trim())}>Cancel order</Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>Keep it</Button>
      </div>
    </Sheet>
  )
}

