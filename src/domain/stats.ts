import { addDays, differenceInCalendarDays, isAfter, parseISO, startOfDay } from 'date-fns'
import { combineDayAndTime, dayKey } from './deadlines'
import { matchesRecurrence } from './recurrence'
import type { Occurrence, Task } from './types'

/**
 * How a task's deadline turned out.
 *
 * Failure is derived, never stored: a task is missed exactly while its deadline
 * is in the past and it is not done. Pushing the deadline forward therefore
 * un-fails it with no extra bookkeeping, which is the rule the app promises.
 * Completing it afterwards makes it `late` rather than erasing the miss.
 */
export type Outcome = 'onTime' | 'late' | 'missed' | 'open'

export function outcomeOf(task: Task, now: Date): Outcome {
  const due = parseISO(task.deadline)
  if (task.completedAt) return parseISO(task.completedAt) <= due ? 'onTime' : 'late'
  return due.getTime() < now.getTime() ? 'missed' : 'open'
}

/** The windows the panel offers. `days: null` is all time. */
export const STATS_WINDOWS: { id: string; label: string; days: number | null }[] = [
  { id: '7', label: '7 days', days: 7 },
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
]

export interface Tally {
  onTime: number
  late: number
  missed: number
}

export const EMPTY_TALLY: Tally = { onTime: 0, late: 0, missed: 0 }

export const judged = (t: Tally): number => t.onTime + t.late + t.missed

/**
 * Share of judged work that got done at all — late still counts here, because
 * "did it eventually" and "never did it" are different failures. Returns null
 * rather than 0 when nothing has been judged, so the UI can say "no data"
 * instead of "0%".
 */
export function successRate(t: Tally): number | null {
  const total = judged(t)
  return total === 0 ? null : (t.onTime + t.late) / total
}

/** The stricter number: done by the deadline, no credit for late. */
export function onTimeRate(t: Tally): number | null {
  const total = judged(t)
  return total === 0 ? null : t.onTime / total
}

function add(t: Tally, outcome: Outcome): Tally {
  if (outcome === 'open') return t
  return { ...t, [outcome]: t[outcome] + 1 }
}

/** Every calendar day a recurrence rule fires between two days, inclusive. */
export function dueDays(task: Task, from: Date, to: Date): string[] {
  const rec = task.recurrence
  if (!rec) return []
  if (rec.freq === 'weekly' && rec.weekdays.length === 0) return []

  // A rule cannot fire before its first occurrence, or after its `until`.
  const start = startOfDay(parseISO(task.deadline))
  const until = rec.until ? startOfDay(parseISO(rec.until)) : null
  let day = startOfDay(from)
  if (day < start) day = start
  const last = until && until < startOfDay(to) ? until : startOfDay(to)

  const out: string[] = []
  const span = differenceInCalendarDays(last, day)
  for (let i = 0; i <= span; i++) {
    const d = addDays(day, i)
    if (matchesRecurrence(d, rec)) out.push(dayKey(d))
  }
  return out
}

export interface RecurringStats {
  task: Task
  /** Days the rule fired and whose scheduled time has passed, oldest first. */
  days: string[]
  /** Of those, the ones with a completion logged. */
  done: Set<string>
  tally: Tally
  /** Consecutive done days ending at the most recent judged day. */
  currentStreak: number
  bestStreak: number
}

/**
 * A recurring task's record over the window.
 *
 * Only days whose scheduled instant has already passed are judged, so a daily
 * 18:00 habit is not counted as missed at 09:00 this morning. A day the rule
 * fired on with no completion row is a miss — the app never carries a habit
 * forward, so an unticked day is simply gone.
 */
export function recurringStats(
  task: Task,
  completedDays: ReadonlySet<string>,
  from: Date,
  now: Date,
): RecurringStats {
  const rec = task.recurrence!
  const days = dueDays(task, from, now).filter(
    (key) => !isAfter(combineDayAndTime(parseISO(key), rec.time), now),
  )
  const done = new Set(days.filter((key) => completedDays.has(key)))

  let bestStreak = 0
  let run = 0
  for (const key of days) {
    run = done.has(key) ? run + 1 : 0
    bestStreak = Math.max(bestStreak, run)
  }

  return {
    task,
    days,
    done,
    tally: { onTime: done.size, late: 0, missed: days.length - done.size },
    // `run` ends the loop holding the streak that reaches the most recent day.
    currentStreak: run,
    bestStreak,
  }
}

/** A missed deadline the user has written a reason for. */
export interface FailureNote {
  taskId: string
  title: string
  /** Day key for a recurring miss, null for a one-off. */
  day: string | null
  /** When the deadline was missed — what the notes are sorted by. */
  at: string
  reason: string
}

export interface Stats {
  /** Window start; null for all time. */
  from: Date | null
  oneOff: Tally
  recurring: Tally
  overall: Tally
  /** Per-recurring-task detail, busiest first. */
  habits: RecurringStats[]
  /** Success by goal, for the "am I actually moving on this" question. */
  byGoal: Map<string, Tally>
  /** Newest first. This is what the coaching analysis will be handed. */
  notes: FailureNote[]
}

/**
 * The whole panel in one pass over the board.
 *
 * A one-off task belongs to the window by its deadline — "of the work that came
 * due in the last 30 days, how much landed". Recurring work is judged per day
 * instead, since one row can stand for ninety deadlines.
 */
export function buildStats(
  tasks: Task[],
  occurrences: Occurrence[],
  now: Date,
  windowDays: number | null,
): Stats {
  const from = windowDays === null ? null : startOfDay(addDays(now, -windowDays + 1))
  const inWindow = (d: Date) => (from ? d >= from : true) && d.getTime() <= now.getTime()

  const completedByTask = new Map<string, Set<string>>()
  const reasonsByTask = new Map<string, Map<string, string>>()
  for (const o of occurrences) {
    if (o.completedAt) {
      const set = completedByTask.get(o.taskId) ?? new Set<string>()
      set.add(o.date)
      completedByTask.set(o.taskId, set)
    }
    if (o.failureReason) {
      const map = reasonsByTask.get(o.taskId) ?? new Map<string, string>()
      map.set(o.date, o.failureReason)
      reasonsByTask.set(o.taskId, map)
    }
  }

  let oneOff = EMPTY_TALLY
  let recurring = EMPTY_TALLY
  const byGoal = new Map<string, Tally>()
  const habits: RecurringStats[] = []
  const notes: FailureNote[] = []

  const creditGoals = (task: Task, outcome: Outcome) => {
    for (const goalId of task.goalIds) {
      byGoal.set(goalId, add(byGoal.get(goalId) ?? EMPTY_TALLY, outcome))
    }
  }

  for (const task of tasks) {
    if (task.recurrence) {
      const stats = recurringStats(
        task,
        completedByTask.get(task.id) ?? new Set(),
        // All time still needs a floor to walk from; the first occurrence is it.
        from ?? parseISO(task.deadline),
        now,
      )
      if (stats.days.length === 0) continue
      habits.push(stats)
      recurring = {
        ...recurring,
        onTime: recurring.onTime + stats.tally.onTime,
        missed: recurring.missed + stats.tally.missed,
      }
      // A habit contributes one outcome per judged day, so ninety days of gym
      // outweigh a single one-off task in the goal breakdown, as they should.
      for (const day of stats.days) creditGoals(task, stats.done.has(day) ? 'onTime' : 'missed')

      const dueSet = new Set(stats.days)
      for (const [day, reason] of reasonsByTask.get(task.id) ?? []) {
        if (!dueSet.has(day) || stats.done.has(day)) continue
        notes.push({
          taskId: task.id,
          title: task.title,
          day,
          at: combineDayAndTime(parseISO(day), task.recurrence.time).toISOString(),
          reason,
        })
      }
      continue
    }

    const due = parseISO(task.deadline)
    if (!inWindow(due)) continue
    const outcome = outcomeOf(task, now)
    if (outcome === 'open') continue
    oneOff = add(oneOff, outcome)
    creditGoals(task, outcome)

    if (task.failureReason) {
      notes.push({
        taskId: task.id,
        title: task.title,
        day: null,
        at: task.deadline,
        reason: task.failureReason,
      })
    }
  }

  habits.sort((a, b) => b.days.length - a.days.length || a.task.title.localeCompare(b.task.title))
  notes.sort((a, b) => b.at.localeCompare(a.at))

  return {
    from,
    oneOff,
    recurring,
    overall: {
      onTime: oneOff.onTime + recurring.onTime,
      late: oneOff.late + recurring.late,
      missed: oneOff.missed + recurring.missed,
    },
    habits,
    byGoal,
    notes,
  }
}
