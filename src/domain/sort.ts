import type { Importance } from './types'

export interface Sortable {
  effectiveDeadline: Date
  importance: Importance
  createdAt: string
  id: string
}

/**
 * Deadline wins, importance breaks ties.
 *
 * A task due at noon outranks an urgent one due at midnight. Because the
 * quick-picks stamp many tasks with the identical end-of-day instant,
 * importance is what actually orders most lists. Overdue work needs no special
 * case — a past deadline is simply the smallest one.
 */
export function compareTasks(a: Sortable, b: Sortable): number {
  const byDeadline = a.effectiveDeadline.getTime() - b.effectiveDeadline.getTime()
  if (byDeadline !== 0) return byDeadline

  const byImportance = b.importance - a.importance
  if (byImportance !== 0) return byImportance

  const byCreated = a.createdAt.localeCompare(b.createdAt)
  if (byCreated !== 0) return byCreated

  // Total order, so re-renders never reshuffle equal rows.
  return a.id.localeCompare(b.id)
}
