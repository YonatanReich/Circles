import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Block, Round } from '../domain/types'
import type { Board, GoalInput, TagInput, TaskInput } from './db'
import { db } from './db'
import { taskFromInput } from './localDb'

const BOARD_KEY = ['board'] as const

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
 *
 * They share one scope, so the requests themselves go out one at a time and in
 * order — a block placed on a task created a moment ago can never reach the
 * server before its task does. The optimistic writes are not held back; only
 * the network is. And the board is refetched once, after the last mutation in
 * flight settles: refetching after each would overwrite the optimistic state
 * of the ones still queued, and a block dragged twice in quick succession would
 * jump back to its first position before landing on its second.
 */
function useBoardMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<void>,
  optimistic?: (board: Board, args: TArgs) => Board,
) {
  const qc = useQueryClient()
  return useMutation<void, Error, TArgs, { previous?: Board }>({
    mutationKey: BOARD_KEY,
    scope: { id: 'board' },
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
      if (qc.isMutating({ mutationKey: BOARD_KEY }) === 1) void qc.invalidateQueries({ queryKey: BOARD_KEY })
    },
  })
}

const mapTask = (board: Board, id: string, fn: (task: Board['tasks'][number]) => Board['tasks'][number]): Board => ({
  ...board,
  tasks: board.tasks.map((t) => (t.id === id ? fn(t) : t)),
})

// ---------------------------------------------------------------- tasks ---

/** The id is minted by the caller, so the new task is in the cache before the insert returns. */
export function useCreateTask() {
  return useBoardMutation<{ input: TaskInput; id: string }>(
    ({ input, id }) => db.createTask(input, id),
    (board, { input, id }) => ({ ...board, tasks: [...board.tasks, taskFromInput(input, id)] }),
  )
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
      blocks: board.blocks.filter((b) => b.taskId !== id),
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
  const existing = board.occurrences.find((o) => o.taskId === taskId && o.date === occurrenceDay)
  const others = board.occurrences.filter(
    (o) => !(o.taskId === taskId && o.date === occurrenceDay),
  )
  const failureReason = existing?.failureReason ?? null
  if (done) {
    return {
      ...board,
      occurrences: [
        ...others,
        { taskId, date: occurrenceDay, completedAt: new Date().toISOString(), failureReason },
      ],
    }
  }
  // A row carrying a reason survives un-ticking as a bare miss; the note is the
  // only copy of what the user wrote.
  return {
    ...board,
    occurrences: failureReason
      ? [...others, { taskId, date: occurrenceDay, completedAt: null, failureReason }]
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

/**
 * Why one dated instance of a recurring task was missed. Passing null clears
 * the note, which drops the row unless the day was also completed.
 */
export function useSetOccurrenceReason() {
  return useBoardMutation<{ taskId: string; date: string; reason: string | null }>(
    ({ taskId, date, reason }) => db.setOccurrenceReason(taskId, date, reason),
    (board, { taskId, date, reason }) => {
      const existing = board.occurrences.find((o) => o.taskId === taskId && o.date === date)
      const others = board.occurrences.filter((o) => !(o.taskId === taskId && o.date === date))
      const completedAt = existing?.completedAt ?? null
      return {
        ...board,
        occurrences:
          reason || completedAt
            ? [...others, { taskId, date, completedAt, failureReason: reason }]
            : others,
      }
    },
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

// --------------------------------------------------------------- rounds ---

export function useSaveRound() {
  return useBoardMutation<Round>(
    (round) => db.saveRound(round),
    (board, round) => ({
      ...board,
      rounds: [...board.rounds.filter((r) => r.id !== round.id), round],
    }),
  )
}

export function useDeleteRound() {
  return useBoardMutation<string>(
    (id) => db.deleteRound(id),
    (board, id) => ({ ...board, rounds: board.rounds.filter((r) => r.id !== id) }),
  )
}

// --------------------------------------------------------------- blocks ---

export function useSaveBlock() {
  return useBoardMutation<Block>(
    (block) => db.saveBlock(block),
    (board, block) => ({
      ...board,
      blocks: [...board.blocks.filter((b) => b.id !== block.id), block],
    }),
  )
}

export function useDeleteBlock() {
  return useBoardMutation<string>(
    (id) => db.deleteBlock(id),
    (board, id) => ({ ...board, blocks: board.blocks.filter((b) => b.id !== id) }),
  )
}
