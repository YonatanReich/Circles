import { addDays, getDate, getDay, getDaysInMonth, isAfter, parseISO, startOfDay } from 'date-fns'
import { combineDayAndTime, dayKey } from './deadlines'
import type { Recurrence } from './types'

/** A rule with no match inside this window is treated as exhausted. */
const SEARCH_LIMIT_DAYS = 400

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function matchesRecurrence(day: Date, rec: Recurrence): boolean {
  switch (rec.freq) {
    case 'daily':
      return true
    case 'weekly':
      return rec.weekdays.includes(getDay(day))
    case 'monthly': {
      // Day 31 in a 30-day month lands on the last day rather than being skipped.
      const target = Math.min(rec.day, getDaysInMonth(day))
      return getDate(day) === target
    }
  }
}

/**
 * The next occurrence that is still outstanding, or null once the rule is spent.
 *
 * The search starts at `from`'s day, never at the rule's start date: a habit
 * missed last Tuesday is gone, not owed, so misses never pile up. Today always
 * counts even if its wall time has passed — a 09:00 daily task still appears at
 * 18:00, sorted as overdue.
 */
export function nextOccurrence(
  start: Date,
  rec: Recurrence,
  from: Date,
  completedDays: ReadonlySet<string>,
): Date | null {
  if (rec.freq === 'weekly' && rec.weekdays.length === 0) return null

  const until = rec.until ? startOfDay(parseISO(rec.until)) : null
  const startDay = startOfDay(start)
  let day = startOfDay(from)
  if (day < startDay) day = startDay

  for (let i = 0; i < SEARCH_LIMIT_DAYS; i++) {
    if (until && isAfter(day, until)) return null
    if (matchesRecurrence(day, rec) && !completedDays.has(dayKey(day))) {
      return combineDayAndTime(day, rec.time)
    }
    day = addDays(day, 1)
  }
  return null
}

export function describeRecurrence(rec: Recurrence): string {
  switch (rec.freq) {
    case 'daily':
      return `Every day at ${rec.time}`
    case 'weekly': {
      if (rec.weekdays.length === 7) return `Every day at ${rec.time}`
      const days = [...rec.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d])
      return `${days.join(', ')} at ${rec.time}`
    }
    case 'monthly':
      return `Day ${rec.day} of each month at ${rec.time}`
  }
}
