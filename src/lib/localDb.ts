import type { Goal, Occurrence, Tag, Task } from '../domain/types'
import type { Board, Db, GoalInput, TagInput, TaskInput } from './db'

/**
 * Development fallback used only when no Supabase credentials are present, so
 * the app is runnable straight after a clone. Per-browser, no sync, no auth —
 * the header states as much while it is in use.
 */
export const LOCAL_KEY = 'circles.board.v1'
const KEY = LOCAL_KEY

const empty = (): Board => ({ tasks: [], goals: [], tags: [], occurrences: [] })

function read(): Board {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Board>
    return {
      // Each field is defaulted so a board saved before tags existed still loads.
      tasks: (parsed.tasks ?? []).map((t) => ({ ...t, tagIds: t.tagIds ?? [] })),
      goals: parsed.goals ?? [],
      tags: parsed.tags ?? [],
      occurrences: parsed.occurrences ?? [],
    }
  } catch {
    return empty()
  }
}

function write(board: Board): void {
  localStorage.setItem(KEY, JSON.stringify(board))
}

function mutate(fn: (board: Board) => void): Promise<void> {
  const board = read()
  fn(board)
  write(board)
  return Promise.resolve()
}

const uid = () => crypto.randomUUID()

function withTask(board: Board, id: string, fn: (task: Task) => void): void {
  const task = board.tasks.find((t) => t.id === id)
  if (task) fn(task)
}

export const localDb: Db = {
  kind: 'local',

  init: () => Promise.resolve(),

  load: () => Promise.resolve(read()),

  createTask: (input: TaskInput) =>
    mutate((board) => {
      const id = uid()
      const task: Task = {
        id,
        title: input.title,
        description: input.description,
        deadline: input.deadline,
        importance: input.importance,
        completedAt: null,
        recurrence: input.recurrence,
        createdAt: new Date().toISOString(),
        goalIds: input.goalIds,
        tagIds: input.tagIds,
        subtasks: (input.subtaskTitles ?? []).map((title, position) => ({
          id: uid(),
          taskId: id,
          title,
          done: false,
          position,
        })),
      }
      board.tasks.push(task)
    }),

  updateTask: (id: string, patch: Partial<TaskInput>) =>
    mutate((board) =>
      withTask(board, id, (task) => {
        if (patch.title !== undefined) task.title = patch.title
        if (patch.description !== undefined) task.description = patch.description
        if (patch.deadline !== undefined) task.deadline = patch.deadline
        if (patch.importance !== undefined) task.importance = patch.importance
        if (patch.recurrence !== undefined) task.recurrence = patch.recurrence
        if (patch.goalIds !== undefined) task.goalIds = patch.goalIds
        if (patch.tagIds !== undefined) task.tagIds = patch.tagIds
      }),
    ),

  deleteTask: (id: string) =>
    mutate((board) => {
      board.tasks = board.tasks.filter((t) => t.id !== id)
      board.occurrences = board.occurrences.filter((o) => o.taskId !== id)
    }),

  setTaskCompleted: (id: string, completed: boolean) =>
    mutate((board) =>
      withTask(board, id, (task) => {
        task.completedAt = completed ? new Date().toISOString() : null
      }),
    ),

  setOccurrence: (taskId: string, date: string, done: boolean) =>
    mutate((board) => {
      const others = board.occurrences.filter((o) => !(o.taskId === taskId && o.date === date))
      const next: Occurrence[] = done
        ? [...others, { taskId, date, completedAt: new Date().toISOString() }]
        : others
      board.occurrences = next
    }),

  createGoal: (input: GoalInput) =>
    mutate((board) => {
      const goal: Goal = {
        id: uid(),
        name: input.name,
        description: input.description,
        deadline: input.deadline,
        color: input.color,
        createdAt: new Date().toISOString(),
        archivedAt: null,
      }
      board.goals.push(goal)
    }),

  updateGoal: (id: string, patch: Partial<GoalInput>) =>
    mutate((board) => {
      const goal = board.goals.find((g) => g.id === id)
      if (goal) Object.assign(goal, patch)
    }),

  deleteGoal: (id: string) =>
    mutate((board) => {
      board.goals = board.goals.filter((g) => g.id !== id)
      for (const task of board.tasks) task.goalIds = task.goalIds.filter((g) => g !== id)
    }),

  createTag: (input: TagInput) =>
    mutate((board) => {
      const tag: Tag = {
        id: uid(),
        name: input.name,
        color: input.color,
        createdAt: new Date().toISOString(),
      }
      board.tags.push(tag)
    }),

  updateTag: (id: string, patch: Partial<TagInput>) =>
    mutate((board) => {
      const tag = board.tags.find((t) => t.id === id)
      if (tag) Object.assign(tag, patch)
    }),

  // Deleting a tag detaches it from every task rather than leaving dangling ids.
  deleteTag: (id: string) =>
    mutate((board) => {
      board.tags = board.tags.filter((t) => t.id !== id)
      for (const task of board.tasks) task.tagIds = task.tagIds.filter((t) => t !== id)
    }),

  addSubtask: (taskId: string, title: string) =>
    mutate((board) =>
      withTask(board, taskId, (task) => {
        const position = task.subtasks.reduce((m, s) => Math.max(m, s.position + 1), 0)
        task.subtasks.push({ id: uid(), taskId, title, done: false, position })
      }),
    ),

  setSubtaskDone: (id: string, done: boolean) =>
    mutate((board) => {
      for (const task of board.tasks) {
        const sub = task.subtasks.find((s) => s.id === id)
        if (sub) sub.done = done
      }
    }),

  deleteSubtask: (id: string) =>
    mutate((board) => {
      for (const task of board.tasks) task.subtasks = task.subtasks.filter((s) => s.id !== id)
    }),
}
