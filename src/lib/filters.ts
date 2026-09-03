import { daysFromToday } from '../domain/deadlines'
import type { Ring, RingTask } from '../domain/rings'
import type { Importance } from '../domain/types'

export interface Filters {
  goalIds: string[]
  tagIds: string[]
  /** Importance levels to keep. Empty means every level. */
  importance: Importance[]
  /** Cumulative horizon — "due within N days". null means no limit. */
  withinDays: number | null
}

export const NO_FILTERS: Filters = { goalIds: [], tagIds: [], importance: [], withinDays: null }

export function isFiltering(filters: Filters): boolean {
  return (
    filters.goalIds.length > 0 ||
    filters.tagIds.length > 0 ||
    filters.importance.length > 0 ||
    filters.withinDays !== null
  )
}

/**
 * Within one axis the selections are an OR — picking two tags widens the net.
 * Across axes they are an AND, so goal + tag + horizon narrows it.
 */
export function taskMatches(task: RingTask, filters: Filters, now: Date): boolean {
  if (filters.goalIds.length > 0 && !task.goalIds.some((id) => filters.goalIds.includes(id))) {
    return false
  }
  if (filters.tagIds.length > 0 && !task.tagIds.some((id) => filters.tagIds.includes(id))) {
    return false
  }
  if (filters.importance.length > 0 && !filters.importance.includes(task.importance)) {
    return false
  }
  if (filters.withinDays !== null && daysFromToday(task.effectiveDeadline, now) > filters.withinDays) {
    return false
  }
  return true
}

/**
 * Halves match independently, so filtering can dim the recurring side of a ring
 * while its regular side stays lit.
 */
export function halfMatches(
  ring: Ring,
  half: 'regular' | 'recurring',
  filters: Filters,
  now: Date,
): boolean {
  if (!isFiltering(filters)) return true
  const tasks = half === 'recurring' ? ring.recurringTasks : ring.tasks
  return tasks.some((t) => taskMatches(t, filters, now))
}

export function ringMatches(ring: Ring, filters: Filters, now: Date): boolean {
  if (!isFiltering(filters)) return true
  return halfMatches(ring, 'regular', filters, now) || halfMatches(ring, 'recurring', filters, now)
}
