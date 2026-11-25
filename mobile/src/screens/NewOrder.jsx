import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Flower2, MessageCircle, Search, Star, Trash2, UserCheck, X, ClipboardList, Plus } from 'lucide-react'
import { api } from '../api/index.js'
import { useApp, navigate } from '../state/app.jsx'
import { Screen, Button, Field, Choice, Stepper, inputClass, Skeleton, Pill, Empty } from '../components/ui.jsx'
import { da, num } from '../lib/format.js'
import { FULFILMENT, PAYMENT_METHODS, SOURCES, tidyName } from '../lib/labels.js'
import { addDays, relativeDay, today } from '../lib/time.js'
import { WILAYAS, addLine, buildPayload, digitsOf, emptyDraft, hasUsablePhone, setQuantity, totals, validate, whatsappNumber } from '../lib/orderDraft.js'

const DRAFT_KEY = 'blossom-mobile-draft'
const STEPS = ['items', 'details', 'pay']

function loadDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null')
    if (saved?.draft) return saved
  } catch { /* ignore */ }
  return { draft: emptyDraft(), requestId: api.newRequestId(), attemptKey: null }
}

export default function NewOrder() {
  const { products, refresh, notify, online, shop } = useApp()
  const [state, setState] = useState(loadDraft)
  const [step, setStep] = useState('items')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(null)
  const { draft } = state
  const t = totals(draft)

  useEffect(() => {
    if (!saved) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state))
  }, [state, saved])

  const update = (patch) => setState((s) => ({ ...s, draft: { ...s.draft, ...(typeof patch === 'function' ? patch(s.draft) : patch) } }))
  const reset = () => {
    sessionStorage.removeItem(DRAFT_KEY)
    setState({ draft: emptyDraft(), requestId: api.newRequestId(), attemptKey: null })
    setSaved(null); setErrors({}); setStep('items')
  }

  const stepOfError = (e) => (e.lines ? 'items' : (e.name || e.phone || e.date || e.town) ? 'details' : 'pay')

  const goNext = () => {
    if (step === 'items') {
      if (!draft.lines.length) return setErrors({ lines: 'Add at least one product.' })
      setErrors({}); return setStep('details')
    }
    if (step === 'details') {
      const e = validate(draft)
      const own = Object.fromEntries(Object.entries(e).filter(([k]) => ['name', 'phone', 'date', 'town'].includes(k)))
      setErrors(own)
      if (!Object.keys(own).length) setStep('pay')
    }
  }
  const goBack = () => {
    const i = STEPS.indexOf(step)
    if (i > 0) setStep(STEPS[i - 1])
    else history.length > 1 ? history.back() : navigate('today')
  }

  const save = async () => {
    const e = validate(draft)
    setErrors(e)
    if (Object.keys(e).length) return setStep(stepOfError(e))
    if (!online) return notify('No internet. The order is kept here; save it when you are connected.', 'warn')
    setSaving(true)
    const payload = buildPayload(draft)
    const attemptKey = JSON.stringify(payload)
    let requestId = state.requestId
    try {
      // The server refuses a reused request id with different details. If an
      // earlier try failed and the order changed since, first check whether
      // that try was saved after all (as Blossom POS does).
      if (state.attemptKey && state.attemptKey !== attemptKey) {
        const earlier = await api.findCreatedOrder(requestId)
        if (earlier) { finish(earlier, true); return }
        requestId = api.newRequestId()
      }
      setState((s) => ({ ...s, requestId, attemptKey }))
      const result = await api.createOrder(payload, requestId)
      finish(result.order, false)
    } catch (err) {
      setSaving(false)
      if (api.isNetworkError(err)) notify('The connection dropped. Tap save again: it will not be saved twice.', 'warn')
      else notify(err.message || 'Could not save the order.', 'bad')
    }
  }

  const finish = (order, wasEarlier) => {
    sessionStorage.removeItem(DRAFT_KEY)
    setSaving(false)
    setSaved({ order, draft, wasEarlier })
    refresh()
  }

  if (saved) return <Saved saved={saved} shop={shop} onNew={reset} />

  const quick = draft.kind === 'quick'
  const titles = { items: 'New order', details: quick ? 'Counter sale' : 'Customer & delivery', pay: 'Payment' }
  const stepIndex = STEPS.indexOf(step)

  return (
    <Screen title={titles[step]} subtitle={`Step ${stepIndex + 1} of 3`} back={goBack}
      actions={(draft.lines.length > 0 || draft.name || draft.phone) && <button onClick={() => { if (confirm('Clear this order and start again?')) reset() }} aria-label="Start again" className="grid h-10 w-10 place-items-center rounded-full text-muted active:bg-plum-soft"><Trash2 className="h-5 w-5" /></button>}
      footer={
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-paper/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{num(t.items)} {t.items === 1 ? 'item' : 'items'}{t.adjustment ? ` · ${t.adjustment < 0 ? 'discount' : 'extra'} ${da(Math.abs(t.adjustment))}` : ''}</p>
              <p className="tabular font-display text-[22px] leading-tight text-ink">{da(t.total)}</p>
            </div>
            {step === 'pay'
              ? <Button size="lg" icon={Check} busy={saving} onClick={save} className="min-w-44">{quick ? 'Confirm sale' : 'Save order'}</Button>
              : <Button size="lg" onClick={goNext} disabled={!draft.lines.length} className="min-w-36">Next <ArrowRight className="h-5 w-5" /></Button>}
          </div>
        </div>
      }>
      <ol className="mb-4 flex gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-plum' : 'bg-plum-soft'}`} />)}
      </ol>
      {step === 'items' && <ItemsStep products={products} draft={draft} update={update} error={errors.lines} />}
      {step === 'details' && <DetailsStep draft={draft} update={update} errors={errors} setErrors={setErrors} />}
      {step === 'pay' && <PayStep draft={draft} update={update} errors={errors} totals={t} />}
    </Screen>
  )
}

// ── Step 1: flowers and gifts ─────────────────────────────────
function ItemsStep({ products, draft, update, error }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('pinned')
  const qty = useMemo(() => new Map(draft.lines.map((l) => [l.id, l.quantity])), [draft.lines])

  const categories = useMemo(() => {
    const counts = new Map()
    for (const p of products || []) counts.set(p.category, (counts.get(p.category) || 0) + 1)
    return [...counts.keys()].sort()
  }, [products])
  const hasPinned = (products || []).some((p) => p.starred)
  const activeCat = cat === 'pinned' && !hasPinned ? 'all' : cat

  const list = useMemo(() => {
    let l = products || []
    if (q) {
      const n = q.toLowerCase()
      l = l.filter((p) => `${p.name} ${p.category} ${p.flower_type}`.toLowerCase().includes(n))
    } else if (activeCat === 'pinned') l = l.filter((p) => p.starred)
    else if (activeCat === 'cart') l = l.filter((p) => qty.has(p.id))
    else if (activeCat !== 'all') l = l.filter((p) => p.category === activeCat)
    return l
  }, [products, q, activeCat, qty])

  if (!products) return <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28" />)}</div>

  const chips = [
    ...(hasPinned ? [{ id: 'pinned', label: '★ Pinned' }] : []),
    ...(draft.lines.length ? [{ id: 'cart', label: `In order (${draft.lines.length})` }] : []),
    { id: 'all', label: 'All' },
    ...categories.map((c) => ({ id: c, label: c })),
  ]

  return (
    <>
      <label className="relative mb-3 block">
        <span className="sr-only">Search products</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="Search flowers, gifts…"
          className="h-12 w-full rounded-2xl border border-line bg-paper pl-12 pr-4 text-ink outline-none focus:border-plum focus:ring-4 focus:ring-plum/10" />
      </label>
      {!q && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {chips.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} aria-pressed={activeCat === c.id}
              className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${activeCat === c.id ? 'bg-plum text-white' : 'bg-paper text-muted ring-1 ring-line'}`}>{c.label}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mb-3 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-medium text-rose">{error}</p>}
      {list.length === 0 ? (
        <Empty icon={Flower2} title="No product found">{q ? `Nothing matches “${q}”.` : 'This list is empty.'}</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {list.map((p) => {
            const n = qty.get(p.id) || 0
            return (
              <li key={p.id} className={`card relative overflow-hidden ${n ? 'ring-2 ring-plum' : ''}`}>
                <button onClick={() => update((d) => ({ lines: addLine(d.lines, p) }))} className="press block w-full p-3 text-left" aria-label={`Add ${tidyName(p.name)}`}>
                  {p.image_url
                    ? <img src={p.image_url} alt="" loading="lazy" className="mb-2 aspect-[4/3] w-full rounded-xl object-cover" />
                    : <span className="mb-2 grid aspect-[16/9] w-full place-items-center rounded-xl bg-gradient-to-br from-rose-soft to-plum-soft text-plum"><Flower2 className="h-7 w-7" /></span>}
                  <p className="line-clamp-2 min-h-10 text-sm font-semibold leading-tight text-ink">{p.starred && <Star className="mr-1 inline h-3.5 w-3.5 fill-amber text-amber" />}{tidyName(p.name)}</p>
                  <p className="tabular mt-1 text-sm text-muted">{da(p.price)}</p>
                </button>
                {n > 0 && (
                  <div className="flex items-center justify-between border-t border-line/70 px-2 py-1.5">
                    <Stepper value={n} label={`Quantity of ${p.name}`} onChange={(v) => update((d) => ({ lines: setQuantity(d.lines, p.id, v) }))} />
                  </div>
                )}
                {n > 0 && <span className="tabular absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-plum px-2 text-xs font-bold text-white shadow">{n}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// ── Step 2: who and when ──────────────────────────────────────
function DetailsStep({ draft, update, errors, setErrors }) {
  const [lookup, setLookup] = useState('idle') // idle | checking | found | new | error
  const lastLooked = useRef('')
  const quick = draft.kind === 'quick'
  const delivery = !quick && draft.fulfilment !== 'pickup'

  useEffect(() => {
    if (draft.customer || !hasUsablePhone(draft.phone)) { if (!draft.customer) setLookup('idle'); return undefined }
    const digits = digitsOf(draft.phone)
    if (digits === lastLooked.current) return undefined
    setLookup('checking')
    const timer = setTimeout(async () => {
      lastLooked.current = digits
      try {
        const c = await api.findCustomer(draft.phone.trim())
        if (c) { update({ customer: c, name: c.full_name || draft.name }); setLookup('found') } else setLookup('new')
      } catch { setLookup('error') }
    }, 400)
    return () => clearTimeout(timer)
  }, [draft.phone, draft.customer]) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = (k) => errors[k] && setErrors((e) => { const n = { ...e }; delete n[k]; return n })
  const t = today()
  const dayChips = [0, 1, 2].map((n) => addDays(t, n))

  return (
    <div className="space-y-5">
      <Choice label="Sale type" columns={2} value={draft.kind} onChange={(kind) => update({ kind })}
        options={[{ id: 'order', label: 'Order', hint: 'Prepared for a date' }, { id: 'quick', label: 'Sold now', hint: 'Counter sale, takes it now' }]} />

      <div className="card space-y-4 p-4">
        <Field label="Phone" optional={quick} error={errors.phone}
          hint={lookup === 'checking' ? 'Looking for this customer…' : lookup === 'new' ? 'New customer: their profile is created when you save.' : lookup === 'error' ? 'Could not check this number. You can still save.' : ''}>
          <input type="tel" inputMode="tel" autoComplete="tel" value={draft.customer ? draft.customer.phone || draft.phone : draft.phone} placeholder="0555 12 34 56"
            onChange={(e) => { update({ phone: e.target.value, customer: null }); clear('phone') }} className={inputClass(errors.phone)} />
        </Field>
        {draft.customer ? (
          <div className="flex items-center gap-3 rounded-2xl bg-sage-soft p-3">
            <UserCheck className="h-5 w-5 shrink-0 text-sage" />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{draft.customer.full_name}</p><p className="text-xs text-sage">Returning customer</p></div>
            <button onClick={() => { update({ customer: null }); lastLooked.current = digitsOf(draft.phone); setLookup('new') }} className="text-sm font-semibold text-sage">Not them</button>
          </div>
        ) : (
          <Field label="Name" optional={quick} error={errors.name}>
            <input value={draft.name} onChange={(e) => { update({ name: e.target.value }); clear('name') }} autoComplete="name" placeholder="Customer name" className={inputClass(errors.name)} />
          </Field>
        )}
        {!quick && <Field label="Came through"><Choice label="Came through" options={SOURCES} value={draft.source} onChange={(source) => update({ source })} /></Field>}
      </div>

      {!quick && (
        <div className="card space-y-4 p-4">
          <Field label="How it leaves the shop"><Choice label="Fulfilment" options={FULFILMENT} value={draft.fulfilment} columns={3} onChange={(fulfilment) => update({ fulfilment })} /></Field>
          <Field label={delivery ? 'Delivery day' : 'Pickup day'} optional={!delivery} error={errors.date}>
            <div className="mb-2 grid grid-cols-3 gap-2">
              {dayChips.map((d) => (
                <button key={d} type="button" onClick={() => { update({ date: d }); clear('date') }} className={`press rounded-2xl border py-2.5 text-sm font-semibold ${draft.date === d ? 'border-plum bg-plum text-white' : 'border-line bg-paper'}`}>{relativeDay(d)}</button>
              ))}
            </div>
            <input type="date" min={t} value={draft.date} onChange={(e) => { update({ date: e.target.value }); clear('date') }} className={inputClass(errors.date)} />
          </Field>
          <Field label="Time" optional><input type="time" value={draft.time} onChange={(e) => update({ time: e.target.value })} className={inputClass()} /></Field>
          {delivery && (
            <>
              <Field label="Town or address" error={errors.town}>
                <input value={draft.town} onChange={(e) => { update({ town: e.target.value }); clear('town') }} placeholder="e.g. Batna, cité 500 logements" className={inputClass(errors.town)} />
              </Field>
              <Field label="Wilaya" optional>
                <select value={draft.wilaya} onChange={(e) => update({ wilaya: e.target.value })} className={inputClass()}>
                  <option value="">Choose…</option>
                  {WILAYAS.map((w, i) => <option key={w} value={w}>{String(i + 1).padStart(2, '0')} · {w}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>
      )}

      <div className="card p-4">
        <Field label="Notes" optional hint="Card message, colours, wrapping, who receives it…">
          <textarea value={draft.notes} onChange={(e) => update({ notes: e.target.value })} rows={3} className={`${inputClass()} h-auto py-3`} />
        </Field>
      </div>
    </div>
  )
}

// ── Step 3: check and pay ─────────────────────────────────────
function PayStep({ draft, update, errors, totals: t }) {
  const quick = draft.kind === 'quick'
  const [adjKind, setAdjKind] = useState(draft.adjustment < 0 ? 'discount' : draft.adjustment > 0 ? 'extra' : 'none')
  const setAdj = (kind, amount) => {
    setAdjKind(kind)
    const v = Math.abs(Math.round(Number(amount) || 0))
    update({ adjustment: kind === 'none' ? 0 : kind === 'discount' ? -v : v })
  }
  return (
    <div className="space-y-5">
      <ul className="card divide-y divide-line/70">
        {draft.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{tidyName(l.name)}</p><p className="tabular text-xs text-muted">{da(l.price)} · {da(l.price * l.quantity)}</p></div>
            <Stepper value={l.quantity} label={`Quantity of ${l.name}`} onChange={(v) => update((d) => ({ lines: setQuantity(d.lines, l.id, v) }))} />
          </li>
        ))}
        {!draft.lines.length && <li className="px-4 py-4 text-sm text-rose">The order is empty. Go back and add products.</li>}
        <li className="flex justify-between px-4 py-3 text-sm"><span className="text-muted">Subtotal</span><span className="tabular">{da(t.subtotal)}</span></li>
      </ul>

      <div className="card space-y-3 p-4">
        <Choice label="Price change" columns={3} value={adjKind} onChange={(k) => setAdj(k, Math.abs(draft.adjustment))}
          options={[{ id: 'none', label: 'None' }, { id: 'discount', label: 'Discount' }, { id: 'extra', label: 'Extra' }]} />
        {adjKind !== 'none' && (
          <Field label={adjKind === 'discount' ? 'Discount (DA)' : 'Extra charge (DA)'} error={errors.adjustment} hint={adjKind === 'extra' ? 'Wrapping, rush, delivery…' : ''}>
            <input type="number" inputMode="numeric" min="0" value={Math.abs(draft.adjustment) || ''} onChange={(e) => setAdj(adjKind, e.target.value)} className={inputClass(errors.adjustment)} />
          </Field>
        )}
        <div className="flex items-baseline justify-between border-t border-line/70 pt-3"><span className="font-semibold">Total</span><span className="tabular font-display text-2xl">{da(t.total)}</span></div>
      </div>

      <div className="card space-y-4 p-4">
        <Field label="Payment now">
          <Choice label="Payment now" columns={3} value={draft.pay} onChange={(pay) => update({ pay })}
            options={[{ id: 'full', label: 'Paid' }, { id: 'part', label: 'Part' }, { id: 'later', label: 'Later' }]} />
        </Field>
        {draft.pay === 'part' && (
          <Field label="Amount received (DA)" error={errors.paidAmount} hint={t.due > 0 && Number(draft.paidAmount) > 0 ? `${da(t.due)} left to pay` : ''}>
            <input type="number" inputMode="numeric" min="1" value={draft.paidAmount} onChange={(e) => update({ paidAmount: e.target.value })} className={inputClass(errors.paidAmount)} />
          </Field>
        )}
        {draft.pay !== 'later' && <Field label="Paid with"><Choice label="Paid with" columns={3} options={PAYMENT_METHODS} value={draft.method} onChange={(method) => update({ method })} /></Field>}
        {errors.phone && <p role="alert" className="rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">{errors.phone}</p>}
      </div>

      <div className="rounded-2xl bg-plum-soft/60 p-4 text-sm text-plum">
        <p className="font-semibold">{quick ? 'Counter sale' : draft.customer?.full_name || draft.name || 'Customer'}</p>
        <p className="mt-0.5 text-plum/80">
          {quick ? 'Taken now, marked as sold.' : `${FULFILMENT.find((f) => f.id === draft.fulfilment)?.label}${draft.date ? ` · ${relativeDay(draft.date)}` : ''}${draft.time ? ` at ${draft.time}` : ''}${draft.fulfilment !== 'pickup' && draft.town ? ` · ${draft.town}` : ''}`}
        </p>
        <p className="mt-0.5 text-plum/80">{t.due === 0 ? `Paid in full · ${PAYMENT_METHODS.find((m) => m.id === draft.method)?.label}` : t.paid ? `${da(t.paid)} now, ${da(t.due)} later` : `${da(t.due)} to pay later`}</p>
      </div>
    </div>
  )
}

// ── Saved ─────────────────────────────────────────────────────
function Saved({ saved, shop, onNew }) {
  const { order, draft, wasEarlier } = saved
  const quick = draft.kind === 'quick'
  const name = (order.client_name || draft.name || '').split(' ')[0]
  const wa = !quick && whatsappNumber(order.client_phone || draft.phone)
  const t = totals(draft)
  const when = draft.date ? new Date(`${draft.date}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ''
  const message = [
    `Bonjour ${name} 🌸`,
    `Votre commande n°${order.order_number} chez ${shop} est bien enregistrée.`,
    draft.lines.map((l) => `• ${l.quantity} × ${tidyName(l.name)}`).join('\n'),
    `Total : ${da(t.total)}${t.due > 0 ? ` (reste à payer : ${da(t.due)})` : ''}`,
    when ? `${draft.fulfilment === 'pickup' ? 'Retrait' : 'Livraison'} : ${when}${draft.time ? ` à ${draft.time}` : ''}` : '',
    'Merci pour votre confiance !',
  ].filter(Boolean).join('\n')

  return (
    <div className="pt-safe pb-safe flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <span className="pop grid h-20 w-20 place-items-center rounded-full bg-sage text-white shadow-xl shadow-sage/30"><Check className="h-10 w-10" strokeWidth={3} /></span>
      <h1 className="rise mt-6 font-display text-3xl text-ink">{quick ? 'Sale saved' : 'Order saved'}</h1>
      <p className="rise mt-1 text-muted"><span className="tabular font-semibold text-ink">#{order.order_number}</span> · {da(order.total_amount ?? t.total)}</p>
      {wasEarlier && <Pill tone="amber" className="mt-3">This order had already been saved on the first try.</Pill>}
      <div className="mt-8 w-full max-w-sm space-y-3">
        {wa && (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
            className="press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-sage text-base font-semibold text-white shadow-lg shadow-sage/25">
            <MessageCircle className="h-5 w-5" /> Send confirmation on WhatsApp
          </a>
        )}
        <Button variant="secondary" size="lg" icon={ClipboardList} className="w-full" onClick={() => navigate(`orders/${order.id}`, { replace: true })}>Open the order</Button>
        <Button variant="ghost" size="lg" icon={Plus} className="w-full" onClick={onNew}>New order</Button>
      </div>
      <button onClick={() => navigate('today')} className="mt-4 inline-flex items-center gap-1 text-sm text-muted"><X className="h-4 w-4" /> Close</button>
    </div>
  )
}
