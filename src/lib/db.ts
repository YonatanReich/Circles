import type { Goal, Importance, Occurrence, Recurrence, Tag, Task, Tone } from '../domain/types'
import { localDb } from './localDb'
import { isSupabaseConfigured } from './supabase'
import { supabaseDb } from './supabaseDb'

export interface TaskInput {
  title: string
  description: string | null
  deadline: string
  importance: Importance
  recurrence: Recurrence | null
  /** Only ever written for a task whose deadline has already passed. */
  failureReason?: string | null
  goalIds: string[]
  tagIds: string[]
  /** Checklist items typed while creating, before the task has an id. */
  subtaskTitles?: string[]
}

export interface GoalInput {
  name: string
  description: string | null
  deadline: string | null
  color: Tone
}

export interface TagInput {
  name: string
  color: Tone
}

export interface Board {
  tasks: Task[]
  goals: Goal[]
  tags: Tag[]
  occurrences: Occurrence[]
}

/**
 * The whole board loads in one shot rather than per-entity. A personal to-do
 * list is a few hundred rows at most, so paging buys nothing and costs every
 * mutation an invalidation puzzle.
 */
export interface Db {
  readonly kind: 'supabase' | 'local'
  init(): Promise<void>
  load(): Promise<Board>

  createTask(input: TaskInput): Promise<void>
  updateTask(id: string, patch: Partial<TaskInput>): Promise<void>
  deleteTask(id: string): Promise<void>
  setTaskCompleted(id: string, completed: boolean): Promise<void>
  /** Ticks or un-ticks one dated instance of a recurring task. */
  setOccurrence(taskId: string, date: string, done: boolean): Promise<void>
  /**
   * Notes why one dated instance was missed. Writes an occurrence row with no
   * completion, which is how a miss is distinguished from a day never reached.
   */
  setOccurrenceReason(taskId: string, date: string, reason: string | null): Promise<void>

  createGoal(input: GoalInput): Promise<void>
  updateGoal(id: string, patch: Partial<GoalInput>): Promise<void>
  deleteGoal(id: string): Promise<void>

  createTag(input: TagInput): Promise<void>
  updateTag(id: string, patch: Partial<TagInput>): Promise<void>
  deleteTag(id: string): Promise<void>

  addSubtask(taskId: string, title: string): Promise<void>
  setSubtaskDone(id: string, done: boolean): Promise<void>
  deleteSubtask(id: string): Promise<void>
}

/**
 * `?local` forces the browser store even when credentials are present, so the
 * UI can be exercised (with `?local&seed`) without writing to the real
 * database. Development only — it is compiled out of a production build.
 */
const forceLocal =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('local')

/**
 * Supabase is the real backend. The local store is a development fallback so
 * `npm run dev` works before any credentials exist — it is per-browser and
 * does not sync, and the app says so in the header when it is active.
 */
export const db: Db = isSupabaseConfigured && !forceLocal ? supabaseDb : localDb
