import { useEffect, useMemo, useState } from 'react'
import {
  buildRings,
  completedItems,
  indexOccurrences,
  toRingTask,
  type RingTask,
} from './domain/rings'
import styles from './App.module.css'
import { AuthScreen } from './components/AuthScreen'
import { CircleView } from './components/CircleView/CircleView'
import type { RingHalf } from './components/CircleView/types'
import { FilterBar } from './components/FilterBar'
import { GoalsView } from './components/GoalsView'
import { ListView } from './components/ListView'
import { RingModal } from './components/RingModal'
import { StatsView } from './components/StatsView'
import { TagsView } from './components/TagsView'
import { TaskEditor } from './components/TaskEditor'
import { useAuth } from './lib/auth'
import { cx } from './lib/cx'
import { db, type Board } from './lib/db'
import { NO_FILTERS, type Filters } from './lib/filters'
import { signOut } from './lib/supabase'
import {
  useAddSubtask,
  useBoard,
  useCreateGoal,
  useCreateTag,
  useCreateTask,
  useDeleteGoal,
  useDeleteSubtask,
  useDeleteTag,
  useDeleteTask,
  useSetOccurrenceReason,
  useSetTasksDone,
  useToggleSubtask,
  useUpdateGoal,
  useUpdateTag,
  useUpdateTask,
} from './lib/queries'

type View = 'circles' | 'list' | 'stats' | 'goals' | 'tags'

const VIEWS: { id: View; label: string }[] = [
  { id: 'circles', label: 'Circles' },
  { id: 'list', label: 'List' },
  { id: 'stats', label: 'Analysis' },
  { id: 'goals', label: 'Goals' },
  { id: 'tags', label: 'Tags' },
]

const EMPTY_BOARD: Board = { tasks: [], goals: [], tags: [], occurrences: [] }

/** Keeps "today" honest across midnight and lets overdue appear on time. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * The auth gate. Board is a separate component so its queries only ever mount
 * for a signed-in user — there is no window in which an unauthenticated
 * request can be fired at Supabase.
 */
export function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <p className="empty">Loading…</p>
  if (auth.status === 'signedOut') return <AuthScreen />
  return <Board email={auth.email} />
}

function Board({ email }: { email: string | null }) {
  const now = useNow()
  const { data, isPending, error } = useBoard()
  const board = data ?? EMPTY_BOARD

  const [view, setView] = useState<View>('circles')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [showCompleted, setShowCompleted] = useState(false)
  const [openRing, setOpenRing] = useState<{ key: string; half: RingHalf } | null>(null)
  // Only the id is held, never the task object — the editor must see subtasks
  // appear as they are added rather than a snapshot taken when it opened.
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const setTasksDone = useSetTasksDone()
  const setOccurrenceReason = useSetOccurrenceReason()
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const deleteGoal = useDeleteGoal()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const addSubtask = useAddSubtask()
  const toggleSubtask = useToggleSubtask()
  const deleteSubtask = useDeleteSubtask()

  const completedByTask = useMemo(() => indexOccurrences(board.occurrences), [board.occurrences])

  const rings = useMemo(
    () => buildRings(board.tasks, now, completedByTask),
    [board.tasks, now, completedByTask],
  )

  const goalMap = useMemo(() => new Map(board.goals.map((g) => [g.id, g])), [board.goals])
  const tagMap = useMemo(() => new Map(board.tags.map((t) => [t.id, t])), [board.tags])

  const allTasks = useMemo(
    () =>
      board.tasks
        .map((t) => toRingTask(t, now, completedByTask))
        .filter((t): t is RingTask => !!t),
    [board.tasks, now, completedByTask],
  )

  // Includes completed occurrences of recurring tasks, not just one-offs, so a
  // habit ticked by mistake can be put back too.
  const completed = useMemo(
    () => completedItems(board.tasks, board.occurrences, now),
    [board.tasks, board.occurrences, now],
  )

  const setDone = (tasks: RingTask[], done: boolean) => {
    if (tasks.length === 0) return
    setTasksDone.mutate({
      items: tasks.map((t) => ({ taskId: t.id, occurrenceDay: t.occurrenceDay })),
      done,
    })
  }

  const ring = openRing ? rings.find((r) => r.key === openRing.key) : undefined
  const editingTask = editingId && editingId !== 'new'
    ? (allTasks.find((t) => t.id === editingId) ?? null)
    : null

  // A recurring task's missed-reason belongs to the day on show, not the rule,
  // so it is looked up here rather than carried on the resolved task.
  const editingReason =
    editingTask?.occurrenceDay
      ? (board.occurrences.find(
          (o) => o.taskId === editingTask.id && o.date === editingTask.occurrenceDay,
        )?.failureReason ?? null)
      : null

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.brand}>Circles</span>

        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <span className={styles.spacer} />

        {db.kind === 'local' ? (
          <span className={styles.notice} title="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync">
            This browser only
          </span>
        ) : (
          <>
            {email && <span className={styles.account}>{email}</span>}
            <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        )}

        <button type="button" className="btn btn-primary" onClick={() => setEditingId('new')}>
          New task
        </button>
      </header>

      {(view === 'circles' || view === 'list') && (
        <FilterBar
          goals={board.goals}
          tags={board.tags}
          filters={filters}
          onChange={setFilters}
          showCompleted={showCompleted}
          onShowCompleted={setShowCompleted}
          showCompletedToggle={view === 'list'}
        />
      )}

      <main className={cx(styles.main, view === 'circles' && styles.mainCircles)}>
        {error ? (
          <p className={styles.error}>{error.message}</p>
        ) : isPending ? (
          <p className="empty">Loading…</p>
        ) : view === 'circles' ? (
          <CircleView
            rings={rings}
            filters={filters}
            now={now}
            onOpen={(key, half) => setOpenRing({ key, half })}
          />
        ) : view === 'list' ? (
          <ListView
            rings={rings}
            completed={completed}
            goals={goalMap}
            tags={tagMap}
            now={now}
            filters={filters}
            showCompleted={showCompleted}
            onComplete={(tasks) => setDone(tasks, true)}
            onRestore={(tasks) => setDone(tasks, false)}
            onOpenTask={(task) => setEditingId(task.id)}
          />
        ) : view === 'stats' ? (
          <StatsView
            tasks={board.tasks}
            occurrences={board.occurrences}
            goals={board.goals}
            now={now}
            onOccurrenceReason={(taskId, date, reason) =>
              setOccurrenceReason.mutate({ taskId, date, reason })
            }
          />
        ) : view === 'goals' ? (
          <GoalsView
            goals={board.goals}
            tasks={board.tasks}
            onCreate={(input) => createGoal.mutate(input)}
            onUpdate={(id, patch) => updateGoal.mutate({ id, patch })}
            onDelete={(id) => deleteGoal.mutate(id)}
          />
        ) : (
          <TagsView
            tags={board.tags}
            tasks={board.tasks}
            onCreate={(input) => createTag.mutate(input)}
            onUpdate={(id, patch) => updateTag.mutate({ id, patch })}
            onDelete={(id) => deleteTag.mutate(id)}
          />
        )}
      </main>

      {openRing && ring && (
        <RingModal
          ring={ring}
          half={openRing.half}
          goals={goalMap}
          tags={tagMap}
          now={now}
          filters={filters}
          onClose={() => setOpenRing(null)}
          onComplete={(tasks) => setDone(tasks, true)}
          onOpenTask={(task) => setEditingId(task.id)}
        />
      )}

      {editingId && (
        <TaskEditor
          // Remount on a different task so every field resets cleanly.
          key={editingId}
          task={editingTask}
          goals={board.goals}
          tags={board.tags}
          now={now}
          // Saving and deleting only mutate; the editor closes itself through
          // the Modal so the exit animation is not cut short, and `onClose`
          // below is what finally unmounts it.
          onSave={(input) => {
            if (editingTask) updateTask.mutate({ id: editingTask.id, patch: input })
            else createTask.mutate(input)
          }}
          onDelete={editingTask ? () => deleteTask.mutate(editingTask.id) : null}
          onClose={() => setEditingId(null)}
          onAddSubtask={(taskId, title) => addSubtask.mutate({ taskId, title })}
          onToggleSubtask={(id, done) => toggleSubtask.mutate({ id, done })}
          onDeleteSubtask={(id) => deleteSubtask.mutate({ id })}
          occurrenceReason={editingReason}
          onOccurrenceReason={(taskId, date, reason) =>
            setOccurrenceReason.mutate({ taskId, date, reason })
          }
        />
      )}
    </div>
  )
}
