import { describe, expect, it } from 'vitest'
import type { RingTask } from '../domain/rings'
import type { Importance } from '../domain/types'
import { isFiltering, NO_FILTERS, taskMatches } from './filters'

const NOW = new Date(2026, 0, 15, 10, 0, 0)

function task(importance: Importance, tagIds: string[] = []): RingTask {
  return {
    id: `t${importance}`,
    title: 'x',
    description: null,
    deadline: NOW.toISOString(),
    importance,
    completedAt: null,
    recurrence: null,
    failureReason: null,
    createdAt: NOW.toISOString(),
    goalIds: [],
    tagIds,
    subtasks: [],
    effectiveDeadline: NOW,
    isOverdue: false,
    isCompleted: false,
    isRecurring: false,
    occurrenceDay: null,
  }
}

describe('importance filter', () => {
  it('lets everything through when no level is picked', () => {
    expect(isFiltering(NO_FILTERS)).toBe(false)
    expect(taskMatches(task(0), NO_FILTERS, NOW)).toBe(true)
  })

  it('keeps only the picked levels, ORed together', () => {
    const filters = { ...NO_FILTERS, importance: [1, 2] as Importance[] }
    expect(isFiltering(filters)).toBe(true)
    expect(taskMatches(task(0), filters, NOW)).toBe(false)
    expect(taskMatches(task(1), filters, NOW)).toBe(true)
    expect(taskMatches(task(2), filters, NOW)).toBe(true)
  })

  it('ANDs with the other axes', () => {
    const filters = { ...NO_FILTERS, importance: [2] as Importance[], tagIds: ['a'] }
    expect(taskMatches(task(2, ['a']), filters, NOW)).toBe(true)
    expect(taskMatches(task(2, ['b']), filters, NOW)).toBe(false)
    expect(taskMatches(task(0, ['a']), filters, NOW)).toBe(false)
  })
})
