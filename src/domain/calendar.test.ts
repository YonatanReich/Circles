import { describe, expect, it } from 'vitest'
import {
  atMinute,
  blockFor,
  blockSpan,
  canPlaceOn,
  cardMinutes,
  defaultStartMin,
  dropSpan,
  formatDuration,
  formatMinute,
  isBlockDone,
  layoutLanes,
  occurrenceDayOf,
  rangeDays,
  trayTasks,
} from './calendar'
import { indexOccurrences, toRingTask, type RingTask } from './rings'
import type { Block, Task } from './types'

const NOW = new Date(2026, 0, 15, 10, 7, 0) // Thu 15 Jan 2026, 10:07
const day = (d: number) => new Date(2026, 0, d)
const at = (d: number, h: number, m = 0) => new Date(2026, 0, d, h, m)

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

const block = (taskId: string, start: Date, end: Date, id = `b-${taskId}-${start.getTime()}`): Block => ({
  id,
  taskId,
  start: start.toISOString(),
  end: end.toISOString(),
})

const resolve = (tasks: Task[]): RingTask[] =>
  tasks.map((t) => toRingTask(t, NOW, new Map())).filter((t): t is RingTask => !!t)

describe('time math', () => {
  it('starts every range today', () => {
    expect(rangeDays(NOW, 'day')).toEqual([day(15)])
    expect(rangeDays(NOW, 'week').map((d) => d.getDate())).toEqual([15, 16, 17, 18, 19, 20, 21])
  })

  it('maps wall-clock minutes to instants, 1440 being the next midnight', () => {
    expect(atMinute(day(15), 90)).toEqual(at(15, 1, 30))
    expect(atMinute(day(15), 1440)).toEqual(day(16))
  })

  it('cuts a block that runs past midnight at 24:00', () => {
    expect(blockSpan(block('x', at(15, 23), at(16, 1)))).toMatchObject({ startMin: 1380, endMin: 1440 })
    expect(blockSpan(block('x', at(15, 9), at(15, 10, 30)))).toMatchObject({ startMin: 540, endMin: 630 })
  })

  it('formats clock times and durations', () => {
    expect(formatMinute(545)).toBe('09:05')
    expect(formatMinute(1440)).toBe('00:00')
    expect(formatDuration(90)).toBe('1h 30m')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(15)).toBe('15m')
  })

  it('offers the next quarter hour today and nine o’clock elsewhere', () => {
    expect(defaultStartMin(day(15), NOW, 60)).toBe(615)
    expect(defaultStartMin(day(16), NOW, 60)).toBe(540)
    // Never runs a block off the end of the day.
    expect(defaultStartMin(day(15), at(15, 23, 50), 60)).toBe(1380)
  })
})

describe('layoutLanes', () => {
  const span = (startMin: number, endMin: number) => ({ startMin, endMin })

  it('gives non-overlapping blocks the full width', () => {
    const out = layoutLanes([span(0, 60), span(60, 120)])
    expect(out.map((p) => [p.col, p.cols])).toEqual([
      [0, 1],
      [0, 1],
    ])
  })

  it('splits a cluster into lanes and reuses a lane once it frees up', () => {
    // A overlaps B, B overlaps C, A ends before C starts: two lanes, C reuses A's.
    const [a, b, c] = [span(0, 60), span(30, 120), span(60, 90)]
    const out = layoutLanes([c, a, b])
    const of = (s: typeof a) => out.find((p) => p.item === s)!
    expect([of(a).col, of(b).col, of(c).col]).toEqual([0, 1, 0])
    expect(out.every((p) => p.cols === 2)).toBe(true)
  })

  it('sizes each cluster on its own', () => {
    const out = layoutLanes([span(0, 60), span(0, 60), span(200, 260)])
    expect(out.map((p) => p.cols)).toEqual([2, 2, 1])
  })
})

describe('trayTasks', () => {
  const late = task({ deadline: at(14, 9) })
  const soon = task({ deadline: at(15, 18) })
  const later = task({ deadline: at(20, 18) })
  const done = task({ deadline: at(13, 9), completedAt: at(13, 8).toISOString() })
  const habit = task({ deadline: at(1, 7), recurrence: { freq: 'daily', time: '07:00' } })
  const all = resolve([later, habit, done, soon, late])

  it('defaults to overdue work, habits included', () => {
    // Yesterday's task first, then the habit that was due at 07:00 today.
    expect(trayTasks(all, 'overdue').map((t) => t.id)).toEqual([late.id, habit.id])
  })

  it('lists open one-offs soonest first', () => {
    expect(trayTasks(all, 'deadline').map((t) => t.id)).toEqual([late.id, soon.id, later.id])
  })

  it('lists recurring work on its own', () => {
    expect(trayTasks(all, 'recurring').map((t) => t.id)).toEqual([habit.id])
  })
})

describe('placement', () => {
  const gym = task({
    deadline: at(5, 7),
    recurrence: { freq: 'weekly', weekdays: [1, 3, 5], time: '07:00', until: at(30, 0).toISOString() },
  })
  const oneOff = task({ deadline: at(16, 18) })

  it('keeps recurring work to the days its rule fires, within start and until', () => {
    expect(canPlaceOn(gym, day(16))).toBe(true) // Fri
    expect(canPlaceOn(gym, day(15))).toBe(false) // Thu
    expect(canPlaceOn(gym, day(2))).toBe(false) // Fri, but before the rule began
    expect(canPlaceOn(gym, new Date(2026, 1, 2))).toBe(false) // Mon, past until
    expect(canPlaceOn(oneOff, day(15))).toBe(true)
  })

  it('moves a one-off’s only block wherever it lands, but a habit’s block per day', () => {
    const blocks = [block(oneOff.id, at(15, 9), at(15, 10)), block(gym.id, at(16, 7), at(16, 8))]
    expect(blockFor(blocks, oneOff, day(19))?.id).toBe(blocks[0].id)
    expect(blockFor(blocks, gym, day(16))?.id).toBe(blocks[1].id)
    expect(blockFor(blocks, gym, day(19))).toBeUndefined()
  })

  it('completes a habit block’s own day, and a one-off’s task', () => {
    const b = block(gym.id, at(16, 7), at(16, 8))
    expect(occurrenceDayOf(gym, b)).toBe('2026-01-16')
    expect(occurrenceDayOf(oneOff, b)).toBeNull()
    const completed = indexOccurrences([
      { taskId: gym.id, date: '2026-01-16', completedAt: 'x', failureReason: null },
    ])
    expect(isBlockDone(gym, b, completed)).toBe(true)
    expect(isBlockDone(gym, block(gym.id, at(19, 7), at(19, 8)), completed)).toBe(false)
  })

  it('remembers how long a task’s latest block was', () => {
    const blocks = [block(gym.id, at(12, 7), at(12, 8)), block(gym.id, at(14, 7), at(14, 7, 30))]
    expect(cardMinutes(blocks, gym.id)).toBe(30)
    expect(cardMinutes(blocks, 'nobody')).toBe(60)
  })
})

describe('dropSpan', () => {
  const t = task({ deadline: at(20, 18) })
  const habit = task({ deadline: at(1, 7), recurrence: { freq: 'weekly', weekdays: [5], time: '07:00' } })
  const b = block(t.id, at(15, 9), at(15, 10))

  it('lands a card’s top on the quarter hour under the pointer', () => {
    expect(dropSpan({ kind: 'card', task: t, minutes: 60 }, day(15), 9 * 60 + 14, [])).toEqual({
      startMin: 540,
      endMin: 600,
      valid: true,
    })
  })

  it('never runs off the end of the day', () => {
    expect(dropSpan({ kind: 'card', task: t, minutes: 90 }, day(15), 1430, [])).toMatchObject({
      startMin: 1350,
      endMin: 1440,
    })
  })

  it('keeps a moved block’s grab offset', () => {
    expect(dropSpan({ kind: 'move', task: t, block: b, grabMin: 20 }, day(16), 14 * 60 + 25, [b])).toEqual({
      startMin: 840,
      endMin: 900,
      valid: true,
    })
  })

  it('resizes one edge and never below a quarter hour', () => {
    expect(dropSpan({ kind: 'resize', task: t, block: b, edge: 'end' }, day(15), 11 * 60 + 8, [b])).toMatchObject({
      startMin: 540,
      endMin: 675,
    })
    expect(dropSpan({ kind: 'resize', task: t, block: b, edge: 'end' }, day(15), 0, [b])).toMatchObject({
      endMin: 555,
    })
    expect(dropSpan({ kind: 'resize', task: t, block: b, edge: 'start' }, day(15), 999, [b])).toMatchObject({
      startMin: 585,
      endMin: 600,
    })
  })

  it('refuses recurring work on an off day or a day already holding it', () => {
    const fri = block(habit.id, at(16, 7), at(16, 8))
    const card = { kind: 'card' as const, task: habit, minutes: 60 }
    expect(dropSpan(card, day(15), 600, []).valid).toBe(false) // Thu
    expect(dropSpan(card, day(16), 600, [fri]).valid).toBe(true) // moves that day's block
    const otherFri = block(habit.id, at(23, 7), at(23, 8))
    expect(dropSpan({ kind: 'move', task: habit, block: otherFri, grabMin: 0 }, day(16), 600, [fri, otherFri]).valid).toBe(
      false,
    )
  })
})
