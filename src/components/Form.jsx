import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Plus, Trash2, X } from 'lucide-react'
import { da } from '../lib/format.js'

/** Centered modal with a form. onSubmit may be async; errors show inside. */
export function Dialog({ title, subtitle, onClose, onSubmit, submitLabel = 'Save', tone = 'plum', wide = false, children, footer, disabled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const box = useRef(null)
  const headingId = useId()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    box.current?.querySelector('input:not([type=hidden]),select,textarea')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !onSubmit) return
    setBusy(true); setError(null)
    try {
      await onSubmit()
    } catch (err) {
      setError(err?.message || 'Could not save.')
      setBusy(false)
    }
  }

  return (
    <div className="no-print fixed inset-0 z-[60] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" style={{ animation: 'fade 200ms ease both' }} />
      <form ref={box} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={headingId}
        className={`card rise relative flex max-h-[90vh] w-full flex-col overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <header className="flex items-start justify-between gap-3 border-b border-line/70 px-6 pb-4 pt-5">
          <div>
            <h2 id={headingId} className="font-display text-[22px] leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-plum-soft hover:text-plum"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        {error && (
          <p role="alert" className="mx-6 mb-3 flex items-start gap-2 rounded-xl bg-rose-soft px-3 py-2 text-sm text-rose">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        <footer className="flex items-center justify-between gap-3 border-t border-line/70 bg-cream/50 px-6 py-3">
          <div className="text-sm text-muted">{footer}</div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            {onSubmit && <Button type="submit" tone={tone} busy={busy} disabled={disabled}>{submitLabel}</Button>}
          </div>
        </footer>
      </form>
    </div>
  )
}

export function Button({ children, variant = 'solid', tone = 'plum', busy = false, icon: Icon, className = '', ...props }) {
  const solid = { plum: 'bg-plum text-white hover:bg-plum/90 shadow-sm shadow-plum/20', rose: 'bg-rose text-white hover:bg-rose/90', sage: 'bg-sage text-white hover:bg-sage/90' }[tone]
  const styles = {
    solid,
    outline: 'border border-line bg-paper text-ink hover:border-plum hover:text-plum',
    ghost: 'text-muted hover:bg-plum-soft/60 hover:text-ink',
  }[variant]
  return (
    <button {...props} disabled={props.disabled || busy}
      className={`inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children, className = '' }) {
  const id = useId()
  const child = typeof children === 'function' ? children(id) : children
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">{label}</label>
      {typeof children === 'function' ? child : <Slot id={id}>{child}</Slot>}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

function Slot({ id, children }) {
  // Pass the label's id to the form control.
  return isValidElement(children) ? cloneElement(children, { id: children.props.id || id }) : children
}

const control = 'h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none transition focus:border-plum focus:ring-2 focus:ring-plum/15 disabled:bg-cream disabled:text-muted'

export const Input = (props) => <input {...props} className={`${control} ${props.className || ''}`} />
export const Textarea = (props) => <textarea rows={3} {...props} className={`${control} h-auto py-2 ${props.className || ''}`} />

/** Number field that keeps what you type (empty allowed) and reports numbers. */
export function Money({ value, onChange, suffix = 'DA', ...props }) {
  return (
    <div className="relative">
      <input inputMode="numeric" {...props} value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
        className={`${control} tabular pr-11 text-right`} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>
    </div>
  )
}

export function Select({ options, placeholder, ...props }) {
  return (
    <select {...props} className={`${control} pr-8 ${props.className || ''}`}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
    </select>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-cream/40 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#462c7d]" />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Editable product lines (deliveries, purchase orders).
 * lines: [{ uid, productId, quantity, unitCost }]
 */
export function LineEditor({ lines, setLines, catalogue, supplierId }) {
  const byId = new Map(catalogue.map((p) => [p.id, p]))
  const update = (uid, patch) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  const pick = (uid, productId) => {
    const p = byId.get(Number(productId))
    update(uid, { productId: productId ? Number(productId) : '', unitCost: p?.lastCost != null ? String(Math.round(p.lastCost)) : p?.avgCost != null ? String(Math.round(p.avgCost)) : '' })
  }
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)
  // Products this supplier usually brings first.
  const options = [...catalogue].filter((p) => p.active).sort((a, b) =>
    Number(b.lastSupplierId === Number(supplierId)) - Number(a.lastSupplierId === Number(supplierId)) || a.name.localeCompare(b.name))
    .map((p) => ({ value: p.id, label: `${p.name}${p.tracked ? ` · ${p.stock} in stock` : ''}` }))

  return (
    <div>
      <div className="grid grid-cols-[1fr_90px_120px_110px_32px] gap-2 px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
        <span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit cost</span><span className="text-right">Total</span><span />
      </div>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.uid} className="grid grid-cols-[1fr_90px_120px_110px_32px] items-center gap-2">
            <Select aria-label="Product" value={l.productId} onChange={(e) => pick(l.uid, e.target.value)} placeholder="Choose a product" options={options} />
            <input aria-label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.uid, { quantity: e.target.value.replace(/[^\d]/g, '') })} className={`${control} tabular text-right`} />
            <Money aria-label="Unit cost" value={l.unitCost} onChange={(v) => update(l.uid, { unitCost: v })} />
            <span className="tabular text-right text-sm text-ink">{da((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</span>
            <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.uid !== l.uid) : ls))}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-rose"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between">
        <Button type="button" variant="outline" icon={Plus} onClick={() => setLines((ls) => [...ls, newLine()])}>Add a product</Button>
        <p className="text-sm text-muted">Total <span className="tabular ml-2 font-display text-lg text-ink">{da(total)}</span></p>
      </div>
    </div>
  )
}

let uidSeq = 0
export const newLine = (patch = {}) => ({ uid: `l${++uidSeq}`, productId: '', quantity: '', unitCost: '', ...patch })

/** Yes/no question with an optional reason. */
export function Confirm({ title, children, confirmLabel = 'Confirm', tone = 'rose', askReason, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  return (
    <Dialog title={title} onClose={onClose} tone={tone} submitLabel={confirmLabel} disabled={askReason && !reason.trim()}
      onSubmit={async () => { await onConfirm(reason.trim()); onClose() }}>
      <div className="text-sm text-ink">{children}</div>
      {askReason && <Field label={askReason}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>}
    </Dialog>
  )
}

/** Tiny hook: which dialog is open and with what. */
export function useDialog() {
  const [state, setState] = useState(null)
  return { state, open: (kind, data = null) => setState({ kind, data }), close: () => setState(null), is: (kind) => state?.kind === kind }
}
