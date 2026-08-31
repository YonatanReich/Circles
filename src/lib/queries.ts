import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Board, GoalInput, TagInput, TaskInput } from './db'
import { db } from './db'

export const BOARD_KEY = ['board'] as const

export function useBoard() {
  return useQuery({
    queryKey: BOARD_KEY,
    queryFn: async (): Promise<Board> => {
      await db.init()
      return db.load()
    },
    staleTime: 30_000,
  })
}

/**
 * Every mutation writes the expected result into the cache first and rolls back
 * on failure. Ticking a task off has to feel like a checkbox, not a request.
 */
function useBoardMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<void>,
  optimistic?: (board: Board, args: TArgs) => Board,
) {
  const qc = useQueryClient()
  return useMutation<void, Error, TArgs, { previous?: Board }>({
    mutationFn,
    onMutate: async (args) => {
      if (!optimistic) return {}
      await qc.cancelQueries({ queryKey: BOARD_KEY })
      const previous = qc.getQueryData<Board>(BOARD_KEY)
      if (previous) qc.setQueryData<Board>(BOARD_KEY, optimistic(previous, args))
      return { previous }
    },
    onError: (_error, _args, context) => {
      if (context?.previous) qc.setQueryData<Board>(BOARD_KEY, context.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: BOARD_KEY })
    },
  })
}

const mapTask = (board: Board, id: string, fn: (task: Board['tasks'][number]) => Board['tasks'][number]): Board => ({
  ...board,
  tasks: board.tasks.map((t) => (t.id === id ? fn(t) : t)),
})

// ---------------------------------------------------------------- tasks ---

export function useCreateTask() {
  return useBoardMutation<TaskInput>((input) => db.createTask(input))
}

export function useUpdateTask() {
  return useBoardMutation<{ id: string; patch: Partial<TaskInput> }>(
    ({ id, patch }) => db.updateTask(id, patch),
    (board, { id, patch }) => mapTask(board, id, (t) => ({ ...t, ...patch })),
  )
}

export function useDeleteTask() {
  return useBoardMutation<string>(
    (id) => db.deleteTask(id),
    (board, id) => ({
      ...board,
      tasks: board.tasks.filter((t) => t.id !== id),
      occurrences: board.occurrences.filter((o) => o.taskId !== id),
    }),
  )
}

/**
 * One shape for both kinds of task: a one-off stamps `completed_at`, while a
 * recurring one writes a row into the occurrence log for that specific day.
 */
export interface ToggleArgs {
  taskId: string
  /** Occurrence day for a recurring task; null for a one-off. */
  occurrenceDay: string | null
}

function applyDone(board: Board, { taskId, occurrenceDay }: ToggleArgs, done: boolean): Board {
  if (!occurrenceDay) {
    return mapTask(board, taskId, (t) => ({
      ...t,
      completedAt: done ? new Date().toISOString() : null,
    }))
  }
  const others = board.occurrences.filter(
    (o) => !(o.taskId === taskId && o.date === occurrenceDay),
  )
  return {
    ...board,
    occurrences: done
      ? [...others, { taskId, date: occurrenceDay, completedAt: new Date().toISOString() }]
      : others,
  }
}

/**
 * Completes or restores a whole selection at once. Batched deliberately: one
 * optimistic update and one refetch, so ticking off six things does not make
 * the board flicker six times.
 */
export function useSetTasksDone() {
  return useBoardMutation<{ items: ToggleArgs[]; done: boolean }>(
    async ({ items, done }) => {
      for (const item of items) {
        await (item.occurrenceDay
          ? db.setOccurrence(item.taskId, item.occurrenceDay, done)
          : db.setTaskCompleted(item.taskId, done))
      }
    },
    (board, { items, done }) => items.reduce((acc, item) => applyDone(acc, item, done), board),
  )
}

// ---------------------------------------------------------------- goals ---

export function useCreateGoal() {
  return useBoardMutation<GoalInput>((input) => db.createGoal(input))
}

export function useUpdateGoal() {
  return useBoardMutation<{ id: string; patch: Partial<GoalInput> }>(({ id, patch }) =>
    db.updateGoal(id, patch),
  )
}

export function useDeleteGoal() {
  return useBoardMutation<string>(
    (id) => db.deleteGoal(id),
    (board, id) => ({
      ...board,
      goals: board.goals.filter((g) => g.id !== id),
      tasks: board.tasks.map((t) => ({ ...t, goalIds: t.goalIds.filter((g) => g !== id) })),
    }),
  )
}

// ----------------------------------------------------------------- tags ---

export function useCreateTag() {
  return useBoardMutation<TagInput>((input) => db.createTag(input))
}

export function useUpdateTag() {
  return useBoardMutation<{ id: string; patch: Partial<TagInput> }>(({ id, patch }) =>
    db.updateTag(id, patch),
  )
}

export function useDeleteTag() {
  return useBoardMutation<string>(
    (id) => db.deleteTag(id),
    (board, id) => ({
      ...board,
      tags: board.tags.filter((t) => t.id !== id),
      tasks: board.tasks.map((t) => ({ ...t, tagIds: t.tagIds.filter((x) => x !== id) })),
    }),
  )
}

// ------------------------------------------------------------- subtasks ---

export function useAddSubtask() {
  return useBoardMutation<{ taskId: string; title: string }>(({ taskId, title }) =>
    db.addSubtask(taskId, title),
  )
}

export function useToggleSubtask() {
  return useBoardMutation<{ id: string; done: boolean }>(
    ({ id, done }) => db.setSubtaskDone(id, done),
    (board, { id, done }) => ({
      ...board,
      tasks: board.tasks.map((t) => ({
        ...t,
        subtasks: t.subtasks.map((s) => (s.id === id ? { ...s, done } : s)),
      })),
    }),
  )
}

export function useDeleteSubtask() {
  return useBoardMutation<{ id: string }>(
    ({ id }) => db.deleteSubtask(id),
    (board, { id }) => ({
      ...board,
      tasks: board.tasks.map((t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== id) })),
    }),
  )
}
