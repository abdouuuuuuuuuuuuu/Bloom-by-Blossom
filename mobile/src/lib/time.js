// Shop time: Algeria is UTC+1 all year. Every "today" in the app means
// today in the shop, whatever the phone's own time zone is.
export const SHOP_TZ = 'Africa/Algiers'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function dayKey(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isFinite(d.getTime()) ? dayFmt.format(d) : ''
}

export const today = (now = new Date()) => dayKey(now)

export function addDays(day, amount) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + amount)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86_400_000)
}

/** "Today", "Tomorrow", "Yesterday", or "Fri 28 Nov". */
export function relativeDay(day, now = new Date()) {
  if (!day) return ''
  const diff = daysBetween(today(now), day)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function longDay(day) {
  if (!day) return ''
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

export function formatTime(value) {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: SHOP_TZ })
}

export function formatDateTime(value) {
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: SHOP_TZ })
}

/** "14:30:00" -> "14:30". */
export const shortTime = (t) => (t ? String(t).slice(0, 5) : '')
