import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns'

/** The four fixed horizons. These are both the quick-pick buttons and the skeleton rings. */
export type QuickPick = 'today' | '3days' | 'week' | 'month'

export const QUICK_PICKS: { id: QuickPick; label: string; days: number }[] = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '3days', label: '3 days', days: 3 },
  { id: 'week', label: 'A week', days: 7 },
  { id: 'month', label: 'A month', days: 30 },
]

/** Anything further out than this collapses into the single outermost ring. */
export const BEYOND_DAYS = 30
export const BEYOND_KEY = 'beyond'

/**
 * Work whose deadline has already passed. Its own innermost ring rather than
 * being folded into Today, so late work reads as late instead of merely urgent.
 * Only rendered when something is actually in it.
 */
export const OVERDUE_KEY = 'overdue'

/** Quick-picks land at end of day — "by today" means any time before midnight. */
export function resolveQuickPick(pick: QuickPick, now: Date): Date {
  const days = QUICK_PICKS.find((p) => p.id === pick)?.days ?? 0
  return endOfDay(addDays(now, days))
}

/** Combines a calendar day with an HH:mm wall time into a local instant. */
export function combineDayAndTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = startOfDay(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/** The local calendar day a deadline belongs to. This string is the ring key. */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function parseDayKey(key: string): Date {
  return startOfDay(parseISO(key))
}

/** Whole calendar days from today to `date` — 0 is today, negative is past. */
export function daysFromToday(date: Date, now: Date): number {
  return differenceInCalendarDays(date, now)
}

/**
 * Ring labels. Named horizons get words ("In a week"); everything else gets a
 * plain day count, so a custom ring never pretends to be a horizon it isn't.
 */
export function ringLabel(key: string, now: Date): string {
  if (key === OVERDUE_KEY) return 'Overdue'
  if (key === BEYOND_KEY) return 'Beyond a month'
  const n = daysFromToday(parseDayKey(key), now)
  if (n <= 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === 7) return 'In a week'
  if (n === 30) return 'In a month'
  return `In ${n} days`
}

/** Terse form for labels drawn on the canvas itself. */
export function ringShortLabel(key: string, now: Date): string {
  if (key === OVERDUE_KEY) return 'Late'
  if (key === BEYOND_KEY) return '30d+'
  const n = daysFromToday(parseDayKey(key), now)
  if (n <= 0) return 'Today'
  return `${n}d`
}

/** Human deadline for a task row: "Today 18:00", "Tomorrow 23:59", "Thu 18 Sep 09:00". */
export function formatDeadline(date: Date, now: Date): string {
  const time = format(date, 'HH:mm')
  if (isSameDay(date, now)) return `Today ${time}`
  if (isSameDay(date, addDays(now, 1))) return `Tomorrow ${time}`
  if (isSameDay(date, addDays(now, -1))) return `Yesterday ${time}`
  const n = daysFromToday(date, now)
  if (n > 1 && n < 7) return `${format(date, 'EEE')} ${time}`
  return `${format(date, 'EEE d MMM')} ${time}`
}

/** Value for an <input type="datetime-local">, which wants local wall time. */
export function toDateTimeLocal(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}
