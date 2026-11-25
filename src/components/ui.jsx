import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Info, X } from 'lucide-react'
import { da, pct } from '../lib/format.js'

export const MARK = '#6b4fb3'       // data marks (validated on the paper surface)
export const MARK_2 = '#c9577a'     // second series where two are needed
export const MARK_SOFT = '#e4dcf3'

export function Card({ title, hint, info, action, children, className = '', pad = true }) {
  return (
    <section className={`card rise ${pad ? 'p-5' : ''} ${className}`}>
      {(title || action) && (
        <header className={`mb-4 flex items-start justify-between gap-3 ${pad ? '' : 'px-5 pt-5'}`}>
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-display text-[17px] text-ink">{title}{info && <InfoTip text={info} />}</h2>
            {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

/** "How is this calculated?" — every number in Bloom can explain itself. */
export function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="How this is calculated" onClick={() => setOpen((v) => !v)} onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full text-muted/70 hover:bg-plum-soft hover:text-plum">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-6 z-40 w-64 -translate-x-1/2 rounded-xl border border-line bg-paper p-3 text-left font-sans text-xs font-normal leading-relaxed text-ink shadow-xl">
          {text}
        </span>
      )}
    </span>
  )
}

export function Delta({ value, suffix, invert = false }) {
  if (value == null) return <span className="text-xs text-muted">{suffix ? 'No earlier data' : ''}</span>
  const up = value >= 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${good ? 'bg-sage-soft text-sage' : 'bg-rose-soft text-rose'}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />{up ? '+' : ''}{value}%
      </span>
      {suffix}
    </span>
  )
}

const TONES = {
  plum: 'bg-plum-soft text-plum', rose: 'bg-rose-soft text-rose', sage: 'bg-sage-soft text-sage',
  amber: 'bg-amber-soft text-amber', sky: 'bg-sky-soft text-sky', muted: 'bg-[#f2edf3] text-muted',
}

export function Stat({ icon: Icon, label, value, info, children, tone = 'plum', onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`card rise flex flex-col gap-2.5 p-4 text-left ${onClick ? 'transition hover:-translate-y-0.5 hover:shadow-lg' : ''}`}>
      <div className="flex items-center gap-2">
        {Icon && <span className={`grid h-7 w-7 place-items-center rounded-lg ${TONES[tone]}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>}
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <p className="tabular font-display text-[26px] leading-none tracking-tight text-ink">{value}</p>
      <div className="min-h-5 text-xs text-muted">{children}</div>
    </Tag>
  )
}

export function Pill({ children, tone = 'muted', className = '' }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[tone]} ${className}`}>{children}</span>
}

/**
 * Horizontal bars with direct labels: one hue, sorted, share of total.
 * Rows are buttons when onSelect is given; the active one is highlighted.
 */
export function BarList({ rows, valueKey = 'revenue', format = da, extra, limit = 8, empty = 'Nothing in this period', onSelect, active, bar = MARK }) {
  const [showAll, setShowAll] = useState(false)
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>
  const total = rows.reduce((s, r) => s + Math.max(r[valueKey], 0), 0)
  const max = Math.max(...rows.map((r) => r[valueKey]), 1)
  const list = showAll ? rows : rows.slice(0, limit)
  return (
    <div>
      <ul className="space-y-1">
        {list.map((r) => {
          const isActive = active != null && String(active) === String(r.key)
          const Tag = onSelect ? 'button' : 'div'
          return (
            <li key={r.key}>
              <Tag onClick={onSelect ? () => onSelect(r.key, r) : undefined} aria-pressed={onSelect ? isActive : undefined}
                className={`block w-full rounded-lg px-2 py-1.5 text-left transition ${onSelect ? 'hover:bg-plum-soft/50' : ''} ${isActive ? 'bg-plum-soft ring-1 ring-plum/30' : ''}`}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{r.label}</span>
                  <span className="tabular shrink-0 text-ink">
                    {format(r[valueKey])} <span className="ml-1 text-xs text-muted">{pct(Math.max(r[valueKey], 0), total)}%</span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-plum-soft/70">
                  <div className="h-1.5 rounded-full transition-[width] duration-500" style={{ width: `${Math.max((r[valueKey] / max) * 100, 1.5)}%`, background: bar }} />
                </div>
                {extra && <p className="mt-1 text-xs text-muted">{extra(r)}</p>}
              </Tag>
            </li>
          )
        })}
      </ul>
      {rows.length > limit && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-plum-soft/50 hover:text-plum">
          {showAll ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg bg-plum-soft/60 p-0.5 text-xs">
      {options.map(([key, text]) => (
        <button key={key} role="tab" aria-selected={value === key} onClick={() => onChange(key)}
          className={`rounded-md px-2.5 py-1.5 font-medium transition ${value === key ? 'bg-paper text-plum shadow-sm' : 'text-muted hover:text-ink'}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

export function Empty({ title = 'Nothing here', children }) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      <p className="font-display text-lg text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  )
}

export function Chip({ children, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-plum px-2.5 py-1 text-xs font-medium text-white shadow-sm">
      {children}
      <button onClick={onRemove} aria-label="Remove filter" className="-mr-1 grid h-4 w-4 place-items-center rounded-full hover:bg-white/20"><X className="h-3 w-3" /></button>
    </span>
  )
}

/** Thin progress bar used for target, margins and shares. */
export function Meter({ value, tone = 'plum', className = '' }) {
  const colors = { plum: MARK, sage: '#4f8a6c', amber: '#b7791f', rose: MARK_2 }
  const v = Math.max(0, Math.min(1, value || 0))
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-plum-soft/70 ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${v * 100}%`, background: colors[tone] }} />
    </div>
  )
}
