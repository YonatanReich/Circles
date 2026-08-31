import { describe, expect, it } from 'vitest'
import {
  combineDayAndTime,
  dayKey,
  daysFromToday,
  formatDeadline,
  resolveQuickPick,
  ringLabel,
  ringShortLabel,
} from './deadlines'

const NOW = new Date(2026, 0, 15, 10, 0, 0) // Thu 15 Jan 2026, 10:00 local

describe('resolveQuickPick', () => {
  it('lands every pick at the last minute of its day', () => {
    for (const pick of ['today', '3days', 'week', 'month'] as const) {
      const d = resolveQuickPick(pick, NOW)
      expect(d.getHours()).toBe(23)
      expect(d.getMinutes()).toBe(59)
    }
  })

  it('maps the four horizons to 0/3/7/30 days out', () => {
    expect(dayKey(resolveQuickPick('today', NOW))).toBe('2026-01-15')
    expect(dayKey(resolveQuickPick('3days', NOW))).toBe('2026-01-18')
    expect(dayKey(resolveQuickPick('week', NOW))).toBe('2026-01-22')
    expect(dayKey(resolveQuickPick('month', NOW))).toBe('2026-02-14')
  })
})

describe('daysFromToday', () => {
  it('counts calendar days, not elapsed hours', () => {
    // 23:00 tonight to 01:00 tomorrow is two hours but one calendar day.
    expect(daysFromToday(new Date(2026, 0, 16, 1, 0), new Date(2026, 0, 15, 23, 0))).toBe(1)
  })

  it('goes negative for the past', () => {
    expect(daysFromToday(new Date(2026, 0, 10), NOW)).toBe(-5)
  })
})

describe('ringLabel', () => {
  it('names the horizons and counts the rest', () => {
    expect(ringLabel('2026-01-15', NOW)).toBe('Today')
    expect(ringLabel('2026-01-16', NOW)).toBe('Tomorrow')
    expect(ringLabel('2026-01-17', NOW)).toBe('In 2 days')
    expect(ringLabel('2026-01-18', NOW)).toBe('In 3 days')
    expect(ringLabel('2026-01-22', NOW)).toBe('In a week')
    expect(ringLabel('2026-01-27', NOW)).toBe('In 12 days')
    expect(ringLabel('2026-02-14', NOW)).toBe('In a month')
    expect(ringLabel('beyond', NOW)).toBe('Beyond a month')
  })

  it('shows overdue rings as Today, since that is where they are shown', () => {
    expect(ringLabel('2026-01-10', NOW)).toBe('Today')
  })
})

describe('ringShortLabel', () => {
  it('is terse enough to sit on the canvas', () => {
    expect(ringShortLabel('2026-01-15', NOW)).toBe('Today')
    expect(ringShortLabel('2026-01-18', NOW)).toBe('3d')
    expect(ringShortLabel('beyond', NOW)).toBe('30d+')
  })
})

describe('combineDayAndTime', () => {
  it('applies a wall time to a calendar day', () => {
    const d = combineDayAndTime(new Date(2026, 0, 15, 18, 30), '09:05')
    expect(d.getHours()).toBe(9)
    expect(d.getMinutes()).toBe(5)
    expect(dayKey(d)).toBe('2026-01-15')
  })
})

describe('formatDeadline', () => {
  it('uses relative words near today and a date further out', () => {
    expect(formatDeadline(new Date(2026, 0, 15, 18, 0), NOW)).toBe('Today 18:00')
    expect(formatDeadline(new Date(2026, 0, 16, 23, 59), NOW)).toBe('Tomorrow 23:59')
    expect(formatDeadline(new Date(2026, 0, 14, 9, 0), NOW)).toBe('Yesterday 09:00')
    expect(formatDeadline(new Date(2026, 0, 17, 12, 0), NOW)).toBe('Sat 12:00')
    expect(formatDeadline(new Date(2026, 1, 20, 12, 0), NOW)).toBe('Fri 20 Feb 12:00')
  })
})
