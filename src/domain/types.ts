/** 0 = normal, 1 = high, 2 = urgent. Numeric so sorting is a subtraction. */
export type Importance = 0 | 1 | 2

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  0: 'Normal',
  1: 'High',
  2: 'Urgent',
}

export const IMPORTANCE_LEVELS: Importance[] = [0, 1, 2]

/**
 * Recurrence rules are stored as jsonb on the task row. Occurrences are never
 * materialised — `nextOccurrence` derives the live one from the rule plus the
 * completion log, so an endless daily task stays a single row.
 */
export type Recurrence =
  | { freq: 'daily'; time: string; until?: string | null }
  | { freq: 'weekly'; weekdays: number[]; time: string; until?: string | null }
  | { freq: 'monthly'; day: number; time: string; until?: string | null }

/**
 * The shared palette for goals and tags. Deliberately excludes anything gold —
 * gold means "recurring" — and anything red, which means "overdue".
 */
export type Tone = 'sky' | 'violet' | 'rose' | 'emerald' | 'indigo' | 'coral'

export const TONES: Tone[] = ['sky', 'violet', 'rose', 'emerald', 'indigo', 'coral']

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  position: number
}

export interface Task {
  id: string
  title: string
  description: string | null
  /** ISO instant. For a recurring task this is the first occurrence. */
  deadline: string
  importance: Importance
  /** Only meaningful for one-off tasks; recurring completion lives in `occurrences`. */
  completedAt: string | null
  recurrence: Recurrence | null
  /**
   * Why the deadline was missed, in the user's words. Kept even once the task
   * is completed late or rescheduled — a missed deadline is a fact about the
   * past, and this is the note explaining it.
   */
  failureReason: string | null
  createdAt: string
  goalIds: string[]
  tagIds: string[]
  subtasks: Subtask[]
}

/** Something you are working towards: it can carry a deadline of its own. */
export interface Goal {
  id: string
  name: string
  description: string | null
  deadline: string | null
  color: Tone
  createdAt: string
  archivedAt: string | null
}

/**
 * A plain label — health, financial, admin. No deadline and no description,
 * which is the whole distinction from a goal: tags say what kind of work this
 * is, goals say what it is in aid of. A task can carry any number of each.
 */
export interface Tag {
  id: string
  name: string
  color: Tone
  createdAt: string
}

/**
 * One judged instance of a recurring task, keyed by local calendar day.
 *
 * `completedAt` set means the day was done. A row with `completedAt: null` and
 * a reason records a day that was missed and annotated — absence of any row
 * still just means outstanding, so nothing is materialised in advance.
 */
export interface Occurrence {
  taskId: string
  date: string
  completedAt: string | null
  failureReason: string | null
}
