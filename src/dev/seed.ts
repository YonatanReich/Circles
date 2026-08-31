import { addDays, endOfDay, set } from 'date-fns'
import type { Goal, Importance, Recurrence, Tag, Task } from '../domain/types'
import type { Board } from '../lib/db'
import { LOCAL_KEY } from '../lib/localDb'

/**
 * Development seed for the local store. Visit `/?seed` to load a board that
 * exercises every ring case at once: an overdue task, same-day ties broken by
 * importance, a custom deadline between two horizons, one past a month, and
 * both flavours of recurrence.
 *
 * Only ever called in dev, and only against the local store.
 */
export function seedLocalBoard(now = new Date()): void {
  const day = (n: number) => endOfDay(addDays(now, n))
  const at = (n: number, hour: number, minute = 0) =>
    set(addDays(now, n), { hours: hour, minutes: minute, seconds: 0, milliseconds: 0 })

  let seq = 0
  const id = () => `seed-${String(++seq).padStart(3, '0')}`

  const goals: Goal[] = [
    {
      id: 'goal-ship',
      name: 'Ship Circles',
      description: 'Get v1 in front of people',
      deadline: day(30).toISOString(),
      color: 'sky',
      createdAt: now.toISOString(),
      archivedAt: null,
    },
    {
      id: 'goal-health',
      // Distinct from the "Health" tag on purpose: the goal is the objective,
      // the tag is the kind of work.
      name: 'Run a half marathon',
      description: 'Race is in the spring',
      deadline: day(45).toISOString(),
      color: 'emerald',
      createdAt: now.toISOString(),
      archivedAt: null,
    },
  ]

  const tags: Tag[] = [
    { id: 'tag-health', name: 'Health', color: 'emerald', createdAt: now.toISOString() },
    { id: 'tag-financial', name: 'Financial', color: 'violet', createdAt: now.toISOString() },
    { id: 'tag-admin', name: 'Admin', color: 'coral', createdAt: now.toISOString() },
  ]

  const make = (
    title: string,
    deadline: Date,
    extra: Partial<Task> & { importance?: Importance; recurrence?: Recurrence | null } = {},
  ): Task => ({
    id: id(),
    title,
    description: null,
    deadline: deadline.toISOString(),
    importance: 0,
    completedAt: null,
    recurrence: null,
    createdAt: now.toISOString(),
    goalIds: [],
    tagIds: [],
    subtasks: [],
    ...extra,
  })

  const withSubtasks = (task: Task, titles: string[]): Task => ({
    ...task,
    subtasks: titles.map((title, i) => ({
      id: `${task.id}-s${i}`,
      taskId: task.id,
      title,
      done: i === 0,
      position: i,
    })),
  })

  const tasks: Task[] = [
    // Overdue — gets its own innermost ring.
    make('Renew the domain', at(-1, 10), {
      importance: 1,
      goalIds: ['goal-ship'],
      tagIds: ['tag-admin'],
    }),

    // Same day, different hours: noon must outrank the urgent midnight task.
    make('Call the bank', at(0, 12), { goalIds: ['goal-ship'], tagIds: ['tag-financial'] }),
    make('Write release notes', day(0), { importance: 2, goalIds: ['goal-ship'] }),
    make('Reply to Dana', day(0), { importance: 1 }),
    withSubtasks(make('Clear the inbox', day(0), { tagIds: ['tag-admin'] }), [
      'Archive newsletters',
      'Answer support',
      'File receipts',
    ]),
    make('Water the plants', day(0), { goalIds: ['goal-health'], tagIds: ['tag-health'] }),

    make('Book the dentist', day(1), { goalIds: ['goal-health'], tagIds: ['tag-health'] }),

    // A custom deadline that opens its own ring between Today and 3 days.
    make('Review the pull request', at(2, 17), { importance: 1, goalIds: ['goal-ship'] }),

    make('Draft the roadmap', day(3), { goalIds: ['goal-ship'] }),
    make('Team retro', day(7)),

    // Another custom ring, this time between a week and a month.
    make('Quarterly review', at(14, 9), { importance: 2 }),

    // Past a month, so it collapses into the outermost ring.
    make('Renew passport', day(45)),

    make('Standup notes', at(0, 9), {
      recurrence: { freq: 'daily', time: '09:00' },
      goalIds: ['goal-ship'],
    }),
    make('Gym', at(0, 7), {
      recurrence: { freq: 'weekly', weekdays: [1, 3, 5], time: '07:00' },
      goalIds: ['goal-health'],
    }),
    make('Pay the rent', at(0, 12), {
      recurrence: { freq: 'monthly', day: 28, time: '12:00' },
      tagIds: ['tag-financial'],
    }),

    make('Cancel the old subscription', at(-2, 9), {
      completedAt: at(-2, 10).toISOString(),
    }),
  ]

  const board: Board = { tasks, goals, tags, occurrences: [] }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(board))
}
