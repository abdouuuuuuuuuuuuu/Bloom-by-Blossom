// A period is an inclusive day range plus how to name and compare it.
import {
  addDays, currentMonth, daysBetween, dayLabel, monthEnd, monthLabel, monthStart, shiftMonth, today, weekdayOf,
} from '../lib/time.js'

/**
 * The shop's week runs Saturday to Friday: the books are closed every Friday.
 * Returns the Friday that ends the week containing `day`.
 */
export function weekEnding(day) {
  // weekdayOf: 0 = Monday … 4 = Friday … 6 = Sunday
  const wd = weekdayOf(day)
  return addDays(day, (4 - wd + 7) % 7)
}

/** kind: 'week' | 'month' | 'year' | 'last30' | 'last90' | 'range' */
export function makePeriod(kind, value, now = new Date()) {
  const t = today(now)
  switch (kind) {
    case 'week': {
      // value = the Friday that closes the week.
      const end = value || weekEnding(t)
      const start = addDays(end, -6)
      return {
        kind, value: end, start, end,
        label: `Week to Fri ${dayLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}`,
        short: `week to ${dayLabel(end, { day: 'numeric', month: 'short' })}`,
      }
    }
    case 'month': {
      const m = value || currentMonth(now)
      return { kind, value: m, start: monthStart(m), end: monthEnd(m), label: monthLabel(m), short: monthLabel(m, 'short') }
    }
    case 'year': {
      const y = value || t.slice(0, 4)
      return { kind, value: y, start: `${y}-01-01`, end: `${y}-12-31`, label: `Year ${y}`, short: y }
    }
    case 'last30':
      return { kind, value: null, start: addDays(t, -29), end: t, label: 'Last 30 days', short: 'Last 30 days' }
    case 'last90':
      return { kind, value: null, start: addDays(t, -89), end: t, label: 'Last 90 days', short: 'Last 90 days' }
    case 'range': {
      const [start, end] = value
      return { kind, value, start, end, label: `${dayLabel(start, { day: 'numeric', month: 'short' })} – ${dayLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}`, short: 'Custom range' }
    }
    default:
      return makePeriod('month', null, now)
  }
}

/** The period just before, of the same shape (previous month, previous year, previous N days). */
export function previousPeriod(p) {
  if (p.kind === 'week') return makePeriod('week', addDays(p.value, -7))
  if (p.kind === 'month') return makePeriod('month', shiftMonth(p.value, -1))
  if (p.kind === 'year') return makePeriod('year', String(Number(p.value) - 1))
  const length = daysBetween(p.start, p.end) + 1
  return { kind: 'range', start: addDays(p.start, -length), end: addDays(p.start, -1), label: 'Previous period', short: 'Previous period' }
}

/** Days of the period that have already happened (for pacing and averages). */
export function elapsedDays(p, now = new Date()) {
  const t = today(now)
  if (t < p.start) return 0
  const end = t < p.end ? t : p.end
  return daysBetween(p.start, end) + 1
}

export const totalDays = (p) => daysBetween(p.start, p.end) + 1
export const inPeriod = (day, p) => day >= p.start && day <= p.end
export const isRunning = (p, now = new Date()) => inPeriod(today(now), p)

/** 'day' for short periods, 'month' for long ones. */
export const grainOf = (p) => (totalDays(p) > 92 ? 'month' : 'day')

/**
 * The period to compare with. While a period is still running, only the same
 * number of days of the previous period is used (1–25 Nov vs 1–25 Oct), so a
 * half-finished month is never compared with a whole one.
 */
export function comparablePrevious(p, now = new Date()) {
  const prev = previousPeriod(p)
  if (!isRunning(p, now)) return { ...prev, partial: false }
  const elapsed = elapsedDays(p, now)
  const end = addDays(prev.start, elapsed - 1)
  return { ...prev, end: end < prev.end ? end : prev.end, partial: true, label: `${prev.label}, first ${elapsed} days`, short: `same days of ${prev.short}` }
}
