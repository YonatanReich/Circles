import { describe, expect, it } from 'vitest'
import { buildTrends, calendarDays, chartBars, matchesRound, periodOf } from './pomodoro'
import type { Goal, Round, Tag } from './types'

// Thu 15 Jan 2026, 10:00. The week runs Sun 11 – Sat 17.
const NOW = new Date(2026, 0, 15, 10, 0, 0)

let seq = 0
const round = (day: number, minutes = 30, goalId: string | null = null, tagId: string | null = null): Round => ({
  id: `r${++seq}`,
  startedAt: new Date(2026, 0, day, 9, 0).toISOString(),
  minutes,
  goalId,
  tagId,
  notes: null,
})

const goal = { id: 'cpp', name: 'Learning C++', color: 'sky' } as Goal
const tag = { id: 'study', name: 'Study', color: 'violet' } as Tag

describe('periods', () => {
  it('weeks start on Sunday', () => {
    const { start, end } = periodOf('week', NOW)
    expect(start).toEqual(new Date(2026, 0, 11))
    expect(end).toEqual(new Date(2026, 0, 18))
  })

  it('a month calendar is whole Sunday-to-Saturday weeks', () => {
    const days = calendarDays('month', NOW)
    expect(days[0]).toEqual(new Date(2025, 11, 28))
    // 31 Jan 2026 is itself a Saturday, so no spill into February.
    expect(days.at(-1)).toEqual(new Date(2026, 0, 31))
    expect(days.length).toBe(35)
  })
})

describe('chartBars', () => {
  it('clips edge weeks to the month so the bars sum to the month', () => {
    const rounds = [round(1), round(3), round(31), round(-1) /* 30 Dec */]
    const bars = chartBars(rounds, 'month', NOW)
    expect(bars[0].label).toBe('1–3')
    expect(bars[0].rounds).toBe(2)
    expect(bars.at(-1)!.label).toBe('25–31')
    expect(bars.reduce((s, b) => s + b.rounds, 0)).toBe(3)
  })
})

describe('matchesRound', () => {
  it('ORs within an axis and ANDs across', () => {
    const r = round(12, 25, 'cpp', 'study')
    expect(matchesRound(r, { goalIds: ['cpp', 'x'], tagIds: [] })).toBe(true)
    expect(matchesRound(r, { goalIds: ['cpp'], tagIds: ['other'] })).toBe(false)
    expect(matchesRound(round(12), { goalIds: ['cpp'], tagIds: [] })).toBe(false)
  })
})

describe('buildTrends', () => {
  it('compares hours with the previous period, per goal and subject', () => {
    const rounds = [
      // last week: 2 h of C++
      round(5, 60, 'cpp'), round(6, 60, 'cpp'),
      // this week: 3 h of C++, 1 h new study
      round(12, 90, 'cpp'), round(13, 90, 'cpp'), round(14, 60, null, 'study'),
    ]
    const report = buildTrends(rounds, 'week', NOW, NOW, [goal], [tag])
    const [total, cpp, study] = report.items

    expect(total).toMatchObject({ hours: 4, previousHours: 2, changePct: 100 })
    expect(cpp).toMatchObject({ axis: 'goal', hours: 3, previousHours: 2, changePct: 50 })
    expect(cpp.summary).toBe(
      'You put 3 h into “Learning C++” this week, compared to 2 h by this point last week — an increase of 50%.',
    )
    expect(study).toMatchObject({ axis: 'subject', changePct: null })
    expect(study.summary).toContain('up from nothing by this point last week')
    // The payload a model will be handed must survive a JSON round-trip.
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('mid-week, compares only with the same stretch of last week', () => {
    // Last Friday is after "this point" (Thu 10:00), so it must not count.
    const report = buildTrends([round(9, 60, 'cpp'), round(12, 60, 'cpp')], 'week', NOW, NOW, [goal], [])
    expect(report.toDate).toBe(true)
    expect(report.items[0]).toMatchObject({ hours: 1, previousHours: 0 })
    expect(report.previous.end).toBe(new Date(2026, 0, 8, 10).toISOString())
  })

  it('names a past week instead of calling it "this week", and compares it whole', () => {
    const report = buildTrends([round(5, 60, 'cpp'), round(3, 30, 'cpp')], 'week', new Date(2026, 0, 5), NOW, [goal], [])
    expect(report.toDate).toBe(false)
    expect(report.items[1].summary).toBe(
      'You put 1 h into “Learning C++” the week of 4 Jan, compared to 0.5 h the week before — an increase of 100%.',
    )
  })
})
