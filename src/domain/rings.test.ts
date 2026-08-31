import { describe, expect, it } from 'vitest'
import { buildRings, completedItems, fixedRingKeys, indexOccurrences, toRingTask } from './rings'
import { compareTasks } from './sort'
import type { Importance, Recurrence, Task } from './types'

const NOW = new Date(2026, 0, 15, 10, 0, 0) // Thu 15 Jan 2026, 10:00

let seq = 0
function task(partial: Omit<Partial<Task>, 'deadline'> & { deadline: Date }): Task {
  seq++
  return {
    id: `t${String(seq).padStart(3, '0')}`,
    title: `task ${seq}`,
    description: null,
    importance: 0,
    completedAt: null,
    recurrence: null,
    createdAt: `2026-01-01T00:00:0${seq % 10}Z`,
    goalIds: [],
    tagIds: [],
    subtasks: [],
    ...partial,
    deadline: partial.deadline.toISOString(),
  }
}

const at = (day: number, hour = 12) => new Date(2026, 0, day, hour, 0, 0)

describe('fixedRingKeys', () => {
  it('is the four horizons, and always present', () => {
    expect(fixedRingKeys(NOW)).toEqual(['2026-01-15', '2026-01-18', '2026-01-22', '2026-02-14'])
  })

  it('renders the skeleton even with no tasks at all', () => {
    const rings = buildRings([], NOW)
    expect(rings.map((r) => r.key)).toEqual([
      '2026-01-15',
      '2026-01-18',
      '2026-01-22',
      '2026-02-14',
    ])
    expect(rings.every((r) => r.count === 0 && r.isFixed)).toBe(true)
  })
})

describe('bucketing', () => {
  it('inserts a custom deadline as its own ring between two horizons', () => {
    const rings = buildRings([task({ deadline: at(17) })], NOW)
    expect(rings.map((r) => r.key)).toEqual([
      '2026-01-15',
      '2026-01-17', // due in 2 days — a new ring between Today and 3 days
      '2026-01-18',
      '2026-01-22',
      '2026-02-14',
    ])
    expect(rings[1].count).toBe(1)
    expect(rings[1].label).toBe('In 2 days')
  })

  it('merges a custom deadline that lands on a horizon into that ring', () => {
    const rings = buildRings([task({ deadline: at(18, 9) })], NOW)
    expect(rings).toHaveLength(4)
    expect(rings.find((r) => r.key === '2026-01-18')!.count).toBe(1)
  })

  it('gives overdue work its own ring, innermost of all', () => {
    const rings = buildRings([task({ deadline: at(10) })], NOW)
    expect(rings.map((r) => r.key)).toEqual([
      'overdue',
      '2026-01-15',
      '2026-01-18',
      '2026-01-22',
      '2026-02-14',
    ])
    expect(rings[0].label).toBe('Overdue')
    expect(rings[0].isOverdue).toBe(true)
    expect(rings[0].count).toBe(1)
    expect(rings[0].tasks[0].isOverdue).toBe(true)
    // Today is left alone rather than absorbing it.
    expect(rings[1].isToday).toBe(true)
    expect(rings[1].count).toBe(0)
  })

  it('shows no overdue ring when nothing is late', () => {
    const rings = buildRings([task({ deadline: at(15, 23) })], NOW)
    expect(rings.some((r) => r.isOverdue)).toBe(false)
    expect(rings[0].isToday).toBe(true)
  })

  it('sends a task restored past its deadline to Overdue, not back to Today', () => {
    // Due yesterday, completed, then un-completed today.
    const restored = task({ deadline: at(14, 9), completedAt: null })
    const rings = buildRings([restored], NOW)
    expect(rings[0].key).toBe('overdue')
    expect(rings[0].tasks[0].id).toBe(restored.id)
  })

  it('collapses anything past a month into a single outer ring', () => {
    const rings = buildRings(
      [task({ deadline: new Date(2026, 2, 20) }), task({ deadline: new Date(2027, 5, 1) })],
      NOW,
    )
    expect(rings[rings.length - 1].key).toBe('beyond')
    expect(rings[rings.length - 1].count).toBe(2)
  })

  it('keeps day 30 inside a real ring and day 31 outside', () => {
    const rings = buildRings(
      [task({ deadline: new Date(2026, 1, 14, 9) }), task({ deadline: new Date(2026, 1, 15, 9) })],
      NOW,
    )
    expect(rings.find((r) => r.key === '2026-02-14')!.count).toBe(1)
    expect(rings.find((r) => r.key === 'beyond')!.count).toBe(1)
  })

  it('does not create a beyond ring when nothing is out there', () => {
    expect(buildRings([task({ deadline: at(16) })], NOW).some((r) => r.key === 'beyond')).toBe(false)
  })

  it('orders rings innermost first with beyond last', () => {
    const rings = buildRings(
      [
        task({ deadline: new Date(2026, 3, 1) }),
        task({ deadline: at(16) }),
        task({ deadline: new Date(2026, 0, 29) }),
      ],
      NOW,
    )
    expect(rings.map((r) => r.key)).toEqual([
      '2026-01-15',
      '2026-01-16',
      '2026-01-18',
      '2026-01-22',
      '2026-01-29',
      '2026-02-14',
      'beyond',
    ])
  })

  it('leaves completed one-off tasks out of the rings', () => {
    const rings = buildRings(
      [task({ deadline: at(15), completedAt: '2026-01-15T09:00:00Z' })],
      NOW,
    )
    expect(rings[0].count).toBe(0)
  })
})

describe('recurring tasks', () => {
  const daily: Recurrence = { freq: 'daily', time: '09:00' }

  it('are kept apart from one-off tasks in the same ring', () => {
    // Both due later today, so neither is pulled out into Overdue.
    const evening: Recurrence = { freq: 'daily', time: '23:00' }
    const rings = buildRings(
      [task({ deadline: at(15) }), task({ deadline: at(1), recurrence: evening })],
      NOW,
    )
    const today = rings.find((r) => r.isToday)!
    expect(today.tasks).toHaveLength(1)
    expect(today.recurringTasks).toHaveLength(1)
    expect(today.count).toBe(2)
  })

  it('move to the next occurrence ring once ticked off', () => {
    const t = task({ deadline: at(1), recurrence: daily })
    const done = indexOccurrences([
      { taskId: t.id, date: '2026-01-15', completedAt: '2026-01-15T09:00:00Z' },
    ])
    const rings = buildRings([t], NOW, done)
    expect(rings[0].key).toBe('2026-01-15')
    expect(rings[0].count).toBe(0)
    expect(rings.find((r) => r.key === '2026-01-16')!.recurringTasks).toHaveLength(1)
  })

  it('disappear once the rule is spent', () => {
    const spent: Recurrence = { freq: 'daily', time: '09:00', until: '2026-01-10' }
    const rings = buildRings([task({ deadline: at(1), recurrence: spent })], NOW)
    expect(rings.every((r) => r.count === 0)).toBe(true)
  })

  it('land in Overdue when today’s time has already passed', () => {
    const rings = buildRings([task({ deadline: at(1), recurrence: daily })], NOW)
    expect(rings[0].key).toBe('overdue')
    expect(rings[0].recurringTasks[0].isOverdue).toBe(true)
    expect(rings[0].recurringTasks[0].occurrenceDay).toBe('2026-01-15')
  })
})

describe('completedItems', () => {
  it('lists completed one-off tasks newest first', () => {
    const a = task({ deadline: at(12), completedAt: '2026-01-13T09:00:00Z' })
    const b = task({ deadline: at(12), completedAt: '2026-01-14T09:00:00Z' })
    const items = completedItems([a, b], [], NOW)
    expect(items.map((t) => t.id)).toEqual([b.id, a.id])
    expect(items.every((t) => t.isCompleted)).toBe(true)
  })

  it('leaves open tasks out', () => {
    expect(completedItems([task({ deadline: at(15) })], [], NOW)).toHaveLength(0)
  })

  it('includes recently completed recurring occurrences', () => {
    const t = task({ deadline: at(1), recurrence: { freq: 'daily', time: '09:00' } })
    const items = completedItems(
      [t],
      [{ taskId: t.id, date: '2026-01-14', completedAt: '2026-01-14T09:30:00Z' }],
      NOW,
    )
    expect(items).toHaveLength(1)
    expect(items[0].isRecurring).toBe(true)
    expect(items[0].occurrenceDay).toBe('2026-01-14')
    // The deadline shown is that day's occurrence, not the rule's start.
    expect(items[0].effectiveDeadline.getHours()).toBe(9)
  })

  it('drops occurrences older than the restore window', () => {
    const t = task({ deadline: at(1), recurrence: { freq: 'daily', time: '09:00' } })
    const items = completedItems(
      [t],
      [{ taskId: t.id, date: '2025-11-02', completedAt: '2025-11-02T09:30:00Z' }],
      NOW,
    )
    expect(items).toHaveLength(0)
  })

  it('ignores occurrence rows whose task is gone', () => {
    const items = completedItems(
      [],
      [{ taskId: 'missing', date: '2026-01-14', completedAt: '2026-01-14T09:30:00Z' }],
      NOW,
    )
    expect(items).toHaveLength(0)
  })
})

describe('ordering inside a ring', () => {
  const ring = (tasks: Task[]) =>
    buildRings(tasks, NOW)
      .find((r) => r.isToday)!
      .tasks.map((t) => t.title)

  it('puts an earlier hour above a later one regardless of importance', () => {
    const noon = task({ deadline: at(15, 12), importance: 0, title: 'noon' })
    const midnight = task({ deadline: at(15, 23), importance: 2, title: 'midnight urgent' })
    expect(ring([midnight, noon])).toEqual(['noon', 'midnight urgent'])
  })

  it('falls back to importance when the deadline is identical', () => {
    const deadline = at(15, 23)
    const normal = task({ deadline, importance: 0, title: 'normal' })
    const urgent = task({ deadline, importance: 2, title: 'urgent' })
    const high = task({ deadline, importance: 1, title: 'high' })
    expect(ring([normal, urgent, high])).toEqual(['urgent', 'high', 'normal'])
  })

  it('lifts overdue work out of Today into its own ring', () => {
    const late = task({ deadline: at(9), title: 'overdue' })
    const urgent = task({ deadline: at(15, 11), importance: 2, title: 'urgent today' })
    const rings = buildRings([urgent, late], NOW)
    expect(rings[0].isOverdue).toBe(true)
    expect(rings[0].tasks.map((t) => t.title)).toEqual(['overdue'])
    expect(rings[1].isToday).toBe(true)
    expect(rings[1].tasks.map((t) => t.title)).toEqual(['urgent today'])
  })

  it('still sorts within the overdue ring, longest overdue first', () => {
    const rings = buildRings(
      [
        task({ deadline: at(14, 9), title: 'yesterday' }),
        task({ deadline: at(2, 9), title: 'ages ago' }),
        task({ deadline: at(15, 8), title: 'this morning' }),
      ],
      NOW,
    )
    expect(rings[0].tasks.map((t) => t.title)).toEqual(['ages ago', 'yesterday', 'this morning'])
  })
})

describe('compareTasks', () => {
  const s = (id: string, ms: number, importance: Importance, createdAt = '2026-01-01T00:00:00Z') => ({
    id,
    effectiveDeadline: new Date(ms),
    importance,
    createdAt,
  })

  it('is a total order, so equal rows never reshuffle', () => {
    const a = s('a', 1000, 0)
    const b = s('b', 1000, 0)
    expect(compareTasks(a, b)).toBeLessThan(0)
    expect(compareTasks(b, a)).toBeGreaterThan(0)
    expect(compareTasks(a, a)).toBe(0)
  })
})

describe('toRingTask', () => {
  it('reports a one-off task’s own deadline unchanged', () => {
    const t = task({ deadline: at(20, 8) })
    const rt = toRingTask(t, NOW, new Map())!
    expect(rt.isRecurring).toBe(false)
    expect(rt.effectiveDeadline.getHours()).toBe(8)
    expect(rt.occurrenceDay).toBeNull()
  })
})
