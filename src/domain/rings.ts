import { addDays, parseISO } from 'date-fns'
import {
  BEYOND_DAYS,
  BEYOND_KEY,
  OVERDUE_KEY,
  combineDayAndTime,
  dayKey,
  daysFromToday,
  parseDayKey,
  ringLabel,
  ringShortLabel,
} from './deadlines'
import { nextOccurrence } from './recurrence'
import { compareTasks } from './sort'
import type { Occurrence, Task } from './types'

/** A task resolved to the instant it is actually next due. */
export interface RingTask extends Task {
  effectiveDeadline: Date
  isOverdue: boolean
  isCompleted: boolean
  isRecurring: boolean
  /** Calendar day of the occurrence on show — the key used to complete it. */
  occurrenceDay: string | null
}

export interface Ring {
  key: string
  label: string
  shortLabel: string
  /** null for the Overdue and Beyond rings, which are not a single day. */
  date: Date | null
  isFixed: boolean
  isOverdue: boolean
  isToday: boolean
  /** One-off tasks. */
  tasks: RingTask[]
  /** Recurring tasks — these drive the golden half. */
  recurringTasks: RingTask[]
  count: number
}

/** The skeleton: these rings render even when empty, so the scale stays learnable. */
const FIXED_HORIZON_DAYS = [0, 3, 7, BEYOND_DAYS]

const EMPTY_SET: ReadonlySet<string> = new Set()

export function fixedRingKeys(now: Date): string[] {
  return FIXED_HORIZON_DAYS.map((d) => dayKey(addDays(now, d)))
}

/**
 * Groups the *completed* days by task for O(1) lookup during resolution. Rows
 * that only record a miss are skipped — a day someone explained away is still
 * a day that did not happen, so it must not suppress the next occurrence.
 */
export function indexOccurrences(occurrences: Occurrence[]): Map<string, Set<string>> {
  const byTask = new Map<string, Set<string>>()
  for (const o of occurrences) {
    if (!o.completedAt) continue
    let set = byTask.get(o.taskId)
    if (!set) byTask.set(o.taskId, (set = new Set()))
    set.add(o.date)
  }
  return byTask
}

/**
 * Resolves a stored task to its live deadline. Returns null only when a
 * recurrence rule is spent (past its `until`, or a weekly rule with no days).
 */
export function toRingTask(
  task: Task,
  now: Date,
  completedByTask: ReadonlyMap<string, ReadonlySet<string>>,
): RingTask | null {
  if (task.recurrence) {
    const done = completedByTask.get(task.id) ?? EMPTY_SET
    const next = nextOccurrence(parseISO(task.deadline), task.recurrence, now, done)
    if (!next) return null
    return {
      ...task,
      effectiveDeadline: next,
      isOverdue: next.getTime() < now.getTime(),
      isCompleted: false,
      isRecurring: true,
      occurrenceDay: dayKey(next),
    }
  }

  const due = parseISO(task.deadline)
  return {
    ...task,
    effectiveDeadline: due,
    isOverdue: !task.completedAt && due.getTime() < now.getTime(),
    isCompleted: !!task.completedAt,
    isRecurring: false,
    occurrenceDay: null,
  }
}

/**
 * Which ring a task lands in. Late work gets its own innermost ring rather
 * than being folded into Today — including a task restored from Completed
 * whose deadline has since passed.
 */
function bucketKey(task: RingTask, now: Date): string {
  if (task.isOverdue) return OVERDUE_KEY
  if (daysFromToday(task.effectiveDeadline, now) > BEYOND_DAYS) return BEYOND_KEY
  return dayKey(task.effectiveDeadline)
}

/**
 * The ring set, innermost first.
 *
 * A ring key *is* a calendar day, so a custom deadline that happens to land on
 * a fixed horizon merges into it with no special case, and one that doesn't
 * inserts its own ring at the right radius.
 */
export function buildRings(
  tasks: Task[],
  now: Date,
  completedByTask: ReadonlyMap<string, ReadonlySet<string>> = new Map(),
): Ring[] {
  const resolved: RingTask[] = []
  for (const task of tasks) {
    const rt = toRingTask(task, now, completedByTask)
    if (rt && !rt.isCompleted) resolved.push(rt)
  }

  const buckets = new Map<string, RingTask[]>()
  for (const rt of resolved) {
    const key = bucketKey(rt, now)
    const list = buckets.get(key)
    if (list) list.push(rt)
    else buckets.set(key, [rt])
  }

  const fixed = fixedRingKeys(now)
  const todayKey = fixed[0]
  const keys = new Set<string>([...fixed, ...buckets.keys()])

  // 'yyyy-MM-dd' sorts lexicographically exactly as it sorts chronologically.
  // Overdue and Beyond are not days, so they are placed by hand at each end and
  // appear only when something is in them.
  const ordered = [...keys].filter((k) => k !== BEYOND_KEY && k !== OVERDUE_KEY).sort()
  if (keys.has(OVERDUE_KEY)) ordered.unshift(OVERDUE_KEY)
  if (keys.has(BEYOND_KEY)) ordered.push(BEYOND_KEY)

  return ordered.map((key) => {
    const members = buckets.get(key) ?? []
    const tasksInRing = members.filter((t) => !t.isRecurring).sort(compareTasks)
    const recurringInRing = members.filter((t) => t.isRecurring).sort(compareTasks)
    const isDay = key !== BEYOND_KEY && key !== OVERDUE_KEY
    return {
      key,
      label: ringLabel(key, now),
      shortLabel: ringShortLabel(key, now),
      date: isDay ? parseDayKey(key) : null,
      isFixed: fixed.includes(key),
      isOverdue: key === OVERDUE_KEY,
      isToday: key === todayKey,
      tasks: tasksInRing,
      recurringTasks: recurringInRing,
      count: members.length,
    }
  })
}

/**
 * Everything that has been ticked off, newest first, for the Completed section.
 *
 * One-off tasks are listed in full — they are finite and never come back on
 * their own. Recurring work is a completion *log* that grows by a row a day, so
 * only the recent window is offered; restoring something from months ago is not
 * a mistake anyone is trying to undo.
 */
const RESTORE_WINDOW_DAYS = 14

export function completedItems(
  tasks: Task[],
  occurrences: Occurrence[],
  now: Date,
): RingTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const items: RingTask[] = []

  for (const task of tasks) {
    if (task.recurrence || !task.completedAt) continue
    const due = parseISO(task.deadline)
    items.push({
      ...task,
      effectiveDeadline: due,
      isOverdue: false,
      isCompleted: true,
      isRecurring: false,
      occurrenceDay: null,
    })
  }

  const cutoff = addDays(now, -RESTORE_WINDOW_DAYS)
  for (const occurrence of occurrences) {
    if (!occurrence.completedAt) continue
    const task = byId.get(occurrence.taskId)
    if (!task?.recurrence) continue
    const day = parseDayKey(occurrence.date)
    if (day < cutoff) continue
    items.push({
      ...task,
      completedAt: occurrence.completedAt,
      effectiveDeadline: combineDayAndTime(day, task.recurrence.time),
      isOverdue: false,
      isCompleted: true,
      isRecurring: true,
      occurrenceDay: occurrence.date,
    })
  }

  return items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
}
