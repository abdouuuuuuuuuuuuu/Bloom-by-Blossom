const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
// fr-FR groups with a narrow no-break space (U+202F) that the display font lacks.
const fix = (s) => s.replace(/ /g, ' ')

/** 125000 -> "125 000 DA" (Algerian dinar, same style as Blossom receipts). */
export const da = (n) => `${fix(nf0.format(Math.round(Number(n) || 0)))} DA`

/** Signed money: "+12 000 DA" / "−3 000 DA". */
export const daSigned = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${da(Math.abs(n))}`

/** Compact for axes: 1 250 000 -> "1,25 M". */
export function daShort(n) {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1_000_000) return `${fix((v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }))} M`
  if (Math.abs(v) >= 1_000) return `${fix((v / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 }))} k`
  return fix(nf0.format(v))
}

export const num = (n) => fix(nf0.format(Number(n) || 0))
export const num1 = (n) => fix(nf1.format(Number(n) || 0))

/** Whole-number share, 0 when the whole is 0. */
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)

/** "42 %" style text for a ratio 0..1, or "—" when unknown. */
export const ratio = (r) => (r == null || !Number.isFinite(r) ? '—' : `${Math.round(r * 100)}%`)

/** Change vs previous period in %. null when there is nothing to compare with. */
export function delta(now, before) {
  if (!before) return null
  return Math.round(((now - before) / Math.abs(before)) * 100)
}

export const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`
