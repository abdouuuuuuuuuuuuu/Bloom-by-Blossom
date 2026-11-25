import { useEffect } from 'react'
import { ChevronLeft, LoaderCircle, X, WifiOff } from 'lucide-react'
import { useApp } from '../state/app.jsx'

const TONES = {
  plum: 'bg-plum-soft text-plum', rose: 'bg-rose-soft text-rose', sage: 'bg-sage-soft text-sage',
  amber: 'bg-amber-soft text-amber', sky: 'bg-sky-soft text-sky', muted: 'bg-[#f2edf3] text-muted', solid: 'bg-plum text-white',
}

export function Pill({ tone = 'muted', children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}>{children}</span>
}

const BTN = {
  primary: 'bg-plum text-white shadow-lg shadow-plum/25 active:bg-plum-2',
  secondary: 'bg-plum-soft text-plum active:bg-[#e4dbf3]',
  ghost: 'text-plum active:bg-plum-soft',
  outline: 'border border-line bg-paper text-ink active:bg-cream',
  danger: 'bg-rose-soft text-rose active:bg-[#f7dbe5]',
  good: 'bg-sage text-white shadow-lg shadow-sage/25',
}

export function Button({ variant = 'primary', size = 'md', busy = false, icon: Icon, children, className = '', ...props }) {
  const sizes = { sm: 'h-9 px-3 text-sm rounded-xl', md: 'h-12 px-4 text-[15px] rounded-2xl', lg: 'h-14 px-5 text-base rounded-2xl' }
  return (
    <button {...props} disabled={props.disabled || busy}
      className={`press inline-flex items-center justify-center gap-2 font-semibold disabled:opacity-50 ${sizes[size]} ${BTN[variant]} ${className}`}>
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon && <Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
      {children}
    </button>
  )
}

/** Screen with a sticky header. `back` shows a back arrow. */
export function Screen({ title, subtitle, back, actions, children, footer }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="pt-safe sticky top-0 z-20 border-b border-line/60 bg-cream/90 backdrop-blur-xl">
        <div className="flex min-h-14 items-center gap-2 px-4 py-2">
          {back && (
            <button onClick={back} aria-label="Back" className="press -ml-2 grid h-10 w-10 place-items-center rounded-full text-plum active:bg-plum-soft">
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] leading-tight text-ink">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      </header>
      <OfflineBar />
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
      {footer}
    </div>
  )
}

export function OfflineBar() {
  const { online } = useApp()
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-soft px-4 py-2 text-xs font-medium text-amber">
      <WifiOff className="h-3.5 w-3.5" /> No internet. You can look, but saving waits for the connection.
    </div>
  )
}

export function Section({ title, action, children, className = '' }) {
  return (
    <section className={`mb-5 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Field({ label, error, hint, children, optional }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}{optional && <span className="font-normal text-muted"> (optional)</span>}</span>
      {children}
      {error ? <span role="alert" className="mt-1 block text-xs font-medium text-rose">{error}</span> : hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass = (error) => `h-12 w-full rounded-2xl border bg-paper px-4 text-ink outline-none transition placeholder:text-muted/60 focus:border-plum focus:ring-4 focus:ring-plum/10 ${error ? 'border-rose' : 'border-line'}`

/** One-choice chips. options: [{ id, label, hint? }] */
export function Choice({ options, value, onChange, columns, label }) {
  return (
    <div role="radiogroup" aria-label={label} className={columns ? 'grid gap-2' : 'flex flex-wrap gap-2'} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = value === o.id
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            className={`press rounded-2xl border px-3.5 py-2.5 text-left text-sm font-semibold transition ${on ? 'border-plum bg-plum text-white shadow-md shadow-plum/20' : 'border-line bg-paper text-ink'}`}>
            {o.label}
            {o.hint && <span className={`block text-[11px] font-normal ${on ? 'text-white/75' : 'text-muted'}`}>{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Bottom sheet for quick actions (payment, reschedule, cancel). */
export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/35" style={{ animation: 'fade-in 200ms ease both' }} />
      <div className="pb-safe relative w-full max-w-lg rounded-t-[28px] bg-cream shadow-2xl" style={{ animation: 'sheet-in 300ms cubic-bezier(.2,.8,.2,1) both' }}>
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between px-5 pb-1 pt-3">
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted active:bg-plum-soft"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  )
}

export function Stepper({ value, onChange, label }) {
  return (
    <div className="inline-flex items-center rounded-full bg-plum-soft" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="One less" className="press grid h-9 w-9 place-items-center rounded-full text-lg font-bold text-plum">−</button>
      <input type="number" inputMode="numeric" value={value} min={0} aria-label="Quantity"
        onChange={(e) => onChange(Number(e.target.value))} onFocus={(e) => e.target.select()}
        className="tabular w-11 bg-transparent text-center font-semibold text-plum outline-none" />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="One more" className="press grid h-9 w-9 place-items-center rounded-full text-lg font-bold text-plum">+</button>
    </div>
  )
}

export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="rise flex flex-col items-center px-6 py-14 text-center">
      {Icon && <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-plum-soft text-plum"><Icon className="h-6 w-6" /></span>}
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

export function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  const tone = { good: 'bg-ink text-white', bad: 'bg-rose text-white', warn: 'bg-amber text-white' }[toast.tone] || 'bg-ink text-white'
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
      <p key={toast.key} role="status" className={`rise max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-medium shadow-xl ${tone}`}>{toast.text}</p>
    </div>
  )
}
