import { describe, expect, it } from 'vitest'
import { buildStats, dueDays, outcomeOf, recurringStats, successRate } from './stats'
import type { Occurrence, Recurrence, Task } from './types'

// Thu 15 Jan 2026, 10:00 — the same anchor the ring tests use.
const NOW = new Date(2026, 0, 15, 10, 0, 0)
const at = (day: number, hour = 12) => new Date(2026, 0, day, hour, 0, 0)

let seq = 0
function task(partial: Omit<Partial<Task>, 'deadline'> & { deadline: Date }): Task {
  seq++
  return {
    id: `t${seq}`,
    title: `task ${seq}`,
    description: null,
    importance: 0,
    completedAt: null,
    recurrence: null,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    goalIds: [],
    tagIds: [],
    subtasks: [],
    ...partial,
    deadline: partial.deadline.toISOString(),
  }
}

const done = (taskId: string, date: string): Occurrence => ({
  taskId,
  date,
  completedAt: `${date}T09:00:00Z`,
  failureReason: null,
})

const missed = (taskId: string, date: string, failureReason: string): Occurrence => ({
  taskId,
  date,
  completedAt: null,
  failureReason,
})

describe('outcomeOf', () => {
  it('is open while the deadline is still ahead', () => {
    expect(outcomeOf(task({ deadline: at(20) }), NOW)).toBe('open')
  })

  it('is missed once the deadline passes with nothing done', () => {
    expect(outcomeOf(task({ deadline: at(14) }), NOW)).toBe('missed')
  })

  it('un-fails when the deadline is pushed past now', () => {
    const late = task({ deadline: at(14) })
    expect(outcomeOf(late, NOW)).toBe('missed')
    expect(outcomeOf({ ...late, deadline: at(20).toISOString() }, NOW)).toBe('open')
  })

  it('separates on time from late rather than calling both success', () => {
    const due = at(14)
    expect(outcomeOf(task({ deadline: due, completedAt: at(13).toISOString() }), NOW)).toBe('onTime')
    expect(outcomeOf(task({ deadline: due, completedAt: at(15).toISOString() }), NOW)).toBe('late')
  })
})

describe('dueDays', () => {
  const from = at(12)
  const to = at(15)

  it('fires every day for a daily rule', () => {
    const t = task({ deadline: at(1), recurrence: { freq: 'daily', time: '09:00' } })
    expect(dueDays(t, from, to)).toEqual(['2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15'])
  })

  it('fires only on the chosen weekdays', () => {
    // 12 Jan 2026 is a Monday.
    const rec: Recurrence = { freq: 'weekly', weekdays: [1, 3], time: '09:00' }
    const t = task({ deadline: at(1), recurrence: rec })
    expect(dueDays(t, from, to)).toEqual(['2026-01-12', '2026-01-14'])
  })

  it('clamps a month day to the length of a short month', () => {
    const t = task({ deadline: new Date(2026, 0, 1), recurrence: { freq: 'monthly', day: 31, time: '09:00' } })
    expect(dueDays(t, new Date(2026, 1, 1), new Date(2026, 1, 28))).toEqual(['2026-02-28'])
  })

  it('never fires before the first occurrence or after `until`', () => {
    const rec: Recurrence = { freq: 'daily', time: '09:00', until: '2026-01-14' }
    const t = task({ deadline: at(13), recurrence: rec })
    expect(dueDays(t, from, to)).toEqual(['2026-01-13', '2026-01-14'])
  })

  it('is empty for a weekly rule with no days', () => {
    const t = task({ deadline: at(1), recurrence: { freq: 'weekly', weekdays: [], time: '09:00' } })
    expect(dueDays(t, from, to)).toEqual([])
  })
})

describe('recurringStats', () => {
  const daily = (time: string) =>
    task({ deadline: at(12), recurrence: { freq: 'daily', time } })

  it('does not judge today until its time has passed', () => {
    // NOW is 10:00; an 18:00 habit has not been missed yet today.
    expect(recurringStats(daily('18:00'), new Set(), at(12), NOW).days).toEqual([
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
    ])
    expect(recurringStats(daily('09:00'), new Set(), at(12), NOW).days).toHaveLength(4)
  })

  it('counts an unticked past day as missed, never as owed', () => {
    const stats = recurringStats(daily('09:00'), new Set(['2026-01-13']), at(12), NOW)
    expect(stats.tally).toEqual({ onTime: 1, late: 0, missed: 3 })
    expect(successRate(stats.tally)).toBeCloseTo(0.25)
  })

  it('tracks the run reaching the latest day, and the best run in the window', () => {
    const stats = recurringStats(
      daily('09:00'),
      new Set(['2026-01-12', '2026-01-14', '2026-01-15']),
      at(12),
      NOW,
    )
    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(2)
  })

  it('reports a broken streak as zero without losing the best', () => {
    const stats = recurringStats(
      daily('09:00'),
      new Set(['2026-01-12', '2026-01-13', '2026-01-14']),
      at(12),
      NOW,
    )
    expect(stats.currentStreak).toBe(0)
    expect(stats.bestStreak).toBe(3)
  })
})

describe('buildStats', () => {
  it('judges one-off tasks by deadline and ignores what is still open', () => {
    const tasks = [
      task({ deadline: at(10), completedAt: at(9).toISOString() }),
      task({ deadline: at(11), completedAt: at(13).toISOString() }),
      task({ deadline: at(12) }),
      task({ deadline: at(20) }),
    ]
    const stats = buildStats(tasks, [], NOW, 30)
    expect(stats.oneOff).toEqual({ onTime: 1, late: 1, missed: 1 })
    expect(successRate(stats.overall)).toBeCloseTo(2 / 3)
  })

  it('drops deadlines older than the window', () => {
    const tasks = [task({ deadline: at(1) }), task({ deadline: at(14) })]
    expect(buildStats(tasks, [], NOW, 7).oneOff).toEqual({ onTime: 0, late: 0, missed: 1 })
    expect(buildStats(tasks, [], NOW, null).oneOff).toEqual({ onTime: 0, late: 0, missed: 2 })
  })

  it('weighs a habit by its days, not as a single task', () => {
    const habit = task({
      deadline: at(12),
      recurrence: { freq: 'daily', time: '09:00' },
      goalIds: ['g1'],
    })
    const stats = buildStats([habit], [done(habit.id, '2026-01-13')], NOW, 30)
    expect(stats.recurring).toEqual({ onTime: 1, late: 0, missed: 3 })
    expect(stats.byGoal.get('g1')).toEqual({ onTime: 1, late: 0, missed: 3 })
    expect(stats.habits).toHaveLength(1)
  })

  it('a miss-only occurrence row explains the day without completing it', () => {
    const habit = task({ deadline: at(12), recurrence: { freq: 'daily', time: '09:00' } })
    const stats = buildStats([habit], [missed(habit.id, '2026-01-13', 'was travelling')], NOW, 30)
    expect(stats.recurring.onTime).toBe(0)
    expect(stats.notes).toEqual([
      expect.objectContaining({ day: '2026-01-13', reason: 'was travelling' }),
    ])
  })

  it('collects one-off reasons newest first', () => {
    const tasks = [
      task({ deadline: at(10), failureReason: 'older' }),
      task({ deadline: at(14), failureReason: 'newer' }),
    ]
    expect(buildStats(tasks, [], NOW, 30).notes.map((n) => n.reason)).toEqual(['newer', 'older'])
  })
})
