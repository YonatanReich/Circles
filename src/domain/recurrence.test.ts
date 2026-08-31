import { describe, expect, it } from 'vitest'
import { dayKey } from './deadlines'
import { describeRecurrence, matchesRecurrence, nextOccurrence } from './recurrence'
import type { Recurrence } from './types'

const NOW = new Date(2026, 0, 15, 10, 0, 0) // Thu 15 Jan 2026
const START = new Date(2026, 0, 1, 9, 0, 0)
const NONE: ReadonlySet<string> = new Set()

const key = (d: Date | null) => (d ? dayKey(d) : null)

describe('daily', () => {
  const rec: Recurrence = { freq: 'daily', time: '09:00' }

  it('offers today even when its time has already passed', () => {
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-15')
  })

  it('moves to tomorrow once today is ticked off', () => {
    const done = new Set(['2026-01-15'])
    expect(key(nextOccurrence(START, rec, NOW, done))).toBe('2026-01-16')
  })

  it('does not resurrect missed days', () => {
    // Nothing was completed all January, yet the next due day is still today.
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-15')
  })

  it('waits until the rule starts', () => {
    const future = new Date(2026, 2, 1, 9, 0)
    expect(key(nextOccurrence(future, rec, NOW, NONE))).toBe('2026-03-01')
  })

  it('carries the rule time, not the start time', () => {
    const at = nextOccurrence(START, { freq: 'daily', time: '18:30' }, NOW, NONE)!
    expect(at.getHours()).toBe(18)
    expect(at.getMinutes()).toBe(30)
  })
})

describe('weekly', () => {
  it('finds the next listed weekday', () => {
    // 15 Jan 2026 is a Thursday; the next Monday is the 19th.
    const rec: Recurrence = { freq: 'weekly', weekdays: [1], time: '08:00' }
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-19')
  })

  it('matches today when today is listed', () => {
    const rec: Recurrence = { freq: 'weekly', weekdays: [4], time: '08:00' }
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-15')
  })

  it('skips to the following listed day once today is done', () => {
    const rec: Recurrence = { freq: 'weekly', weekdays: [1, 4], time: '08:00' }
    const done = new Set(['2026-01-15'])
    expect(key(nextOccurrence(START, rec, NOW, done))).toBe('2026-01-19')
  })

  it('is exhausted when no weekday is selected', () => {
    const rec: Recurrence = { freq: 'weekly', weekdays: [], time: '08:00' }
    expect(nextOccurrence(START, rec, NOW, NONE)).toBeNull()
  })
})

describe('monthly', () => {
  it('clamps day 31 to the last day of a short month', () => {
    const rec: Recurrence = { freq: 'monthly', day: 31, time: '12:00' }
    const feb = new Date(2026, 1, 1, 10, 0)
    // Feb 2026 has 28 days, so the 31st lands on the 28th rather than vanishing.
    expect(key(nextOccurrence(START, rec, feb, NONE))).toBe('2026-02-28')
  })

  it('clamps to 29 in a leap February', () => {
    const rec: Recurrence = { freq: 'monthly', day: 31, time: '12:00' }
    const feb = new Date(2028, 1, 1, 10, 0)
    expect(key(nextOccurrence(START, rec, feb, NONE))).toBe('2028-02-29')
  })

  it('finds a mid-month day in the current month', () => {
    const rec: Recurrence = { freq: 'monthly', day: 20, time: '12:00' }
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-20')
  })

  it('rolls into next month when this month is already past the day', () => {
    const rec: Recurrence = { freq: 'monthly', day: 5, time: '12:00' }
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-02-05')
  })
})

describe('until', () => {
  it('stops the rule dead after its last day', () => {
    const rec: Recurrence = { freq: 'daily', time: '09:00', until: '2026-01-14' }
    expect(nextOccurrence(START, rec, NOW, NONE)).toBeNull()
  })

  it('still allows the final day itself', () => {
    const rec: Recurrence = { freq: 'daily', time: '09:00', until: '2026-01-15' }
    expect(key(nextOccurrence(START, rec, NOW, NONE))).toBe('2026-01-15')
  })
})

describe('matchesRecurrence', () => {
  it('treats day 30 in February as the 28th', () => {
    const rec: Recurrence = { freq: 'monthly', day: 30, time: '12:00' }
    expect(matchesRecurrence(new Date(2026, 1, 28), rec)).toBe(true)
    expect(matchesRecurrence(new Date(2026, 1, 27), rec)).toBe(false)
  })
})

describe('describeRecurrence', () => {
  it('reads as a sentence', () => {
    expect(describeRecurrence({ freq: 'daily', time: '09:00' })).toBe('Every day at 09:00')
    expect(describeRecurrence({ freq: 'weekly', weekdays: [3, 1], time: '08:00' })).toBe(
      'Mon, Wed at 08:00',
    )
    expect(describeRecurrence({ freq: 'monthly', day: 5, time: '12:00' })).toBe(
      'Day 5 of each month at 12:00',
    )
  })

  it('collapses all seven weekdays to "every day"', () => {
    const rec: Recurrence = { freq: 'weekly', weekdays: [0, 1, 2, 3, 4, 5, 6], time: '07:00' }
    expect(describeRecurrence(rec)).toBe('Every day at 07:00')
  })
})
