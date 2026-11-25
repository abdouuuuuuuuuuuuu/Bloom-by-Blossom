// Bloom reports in shop time. Algeria is UTC+1 all year (no daylight saving),
// so a day boundary is always midnight +01:00.
export const SHOP_TZ = 'Africa/Algiers'
export const SHOP_OFFSET = '+01:00'

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: SHOP_TZ, hour: '2-digit', hourCycle: 'h23' })

/** 'YYYY-MM-DD' of a moment, in shop time. */
export function dayKey(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? dayFmt.format(d) : ''
}

/** 0–23 hour of a moment, in shop time. */
export function shopHour(value) {
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? Number(hourFmt.format(d)) % 24 : null
}

export const today = (now = new Date()) => dayKey(now)
export const currentMonth = (now = new Date()) => dayKey(now).slice(0, 7)

export function isMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
}
export function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

export function shiftMonth(month, amount) {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + amount
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

const toUTC = (day) => new Date(`${day}T00:00:00Z`)
const fromUTC = (d) => d.toISOString().slice(0, 10)

export function addDays(day, amount) {
  const d = toUTC(day)
  d.setUTCDate(d.getUTCDate() + amount)
  return fromUTC(d)
}

/** Whole days from a to b (b - a). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000)
}

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export const monthStart = (month) => `${month}-01`
export const monthEnd = (month) => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`

/** 0 = Monday … 6 = Sunday, for a 'YYYY-MM-DD'. */
export function weekdayOf(day) {
  return (toUTC(day).getUTCDay() + 6) % 7
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Every 'YYYY-MM-DD' from start to end inclusive. */
export function eachDay(start, end) {
  const out = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

/** Every 'YYYY-MM' from start month to end month inclusive. */
export function eachMonth(startMonth, endMonth) {
  const out = []
  for (let m = startMonth; m <= endMonth; m = shiftMonth(m, 1)) out.push(m)
  return out
}

export function monthLabel(month, style = 'long') {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', {
    month: style, year: 'numeric', timeZone: 'UTC',
  })
}

export function monthShort(month) {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
}

export function dayLabel(day, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!isDayKey(day)) return ''
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
}

export function formatDateTime(value) {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: SHOP_TZ,
  })
}

export function formatTime(value) {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: SHOP_TZ })
}
