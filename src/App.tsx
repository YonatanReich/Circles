import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  buildRings,
  completedItems,
  indexOccurrences,
  toRingTask,
  type RingTask,
} from './domain/rings'
import styles from './App.module.css'
import { AppHeader } from './components/AppHeader'
import { AuthScreen } from './components/AuthScreen'
import { CircleView } from './components/CircleView/CircleView'
import type { RingHalf } from './components/CircleView/types'
import { FilterBar } from './components/FilterBar'
import { FocusApp } from './components/focus/FocusApp'
import { RoundEditor } from './components/focus/RoundEditor'
import { GoalsView } from './components/GoalsView'
import { Hub } from './components/Hub'
import { ListView } from './components/ListView'
import { RingModal } from './components/RingModal'
import { StatsView } from './components/StatsView'
import { TagsView } from './components/TagsView'
import { TaskEditor } from './components/TaskEditor'
import { useAuth } from './lib/auth'
import { cx } from './lib/cx'
import { type Board } from './lib/db'
import { NO_FILTERS, type Filters } from './lib/filters'
import { useNow } from './lib/useNow'
import { usePomodoro, type Pomodoro } from './lib/usePomodoro'
import {
  useAddSubtask,
  useBoard,
  useCreateGoal,
  useCreateTag,
  useCreateTask,
  useDeleteGoal,
  useDeleteRound,
  useDeleteSubtask,
  useDeleteTag,
  useDeleteTask,
  useSaveRound,
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

const EMPTY_BOARD: Board = { tasks: [], goals: [], tags: [], occurrences: [], rounds: [] }

/**
 * The auth gate. Board is a separate component so its queries only ever mount
 * for a signed-in user — there is no window in which an unauthenticated
 * request can be fired at Supabase.
 */
export function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <p className="empty">Loading…</p>
  if (auth.status === 'signedOut') return <AuthScreen />
  return <SignedIn email={auth.email} />
}

/* ----------------------------------------------------------------- suite --- */

type Route = 'hub' | 'tasks' | 'focus'
type Point = { x: number; y: number }

const readRoute = (): Route => {
  const hash = location.hash.slice(1)
  return hash === 'tasks' || hash === 'focus' ? hash : 'hub'
}

const centerOf = (el: Element): Point => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Screen changes are a circle opening or closing at a point. The View
 * Transitions API snapshots both screens and this animates the clip between
 * them, so neither screen needs to know it is being transitioned. Where the API
 * is missing, or motion is reduced, the swap is instant and each screen's own
 * `.enter` animation still plays.
 */
function circleTransition(update: () => void, at: Point, closing: boolean): void {
  const doc = document.documentElement
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  doc.classList.toggle('vt-closing', closing)
  const t = document.startViewTransition(() => flushSync(update))
  const r = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y))
  const frames = [`circle(0px at ${at.x}px ${at.y}px)`, `circle(${r}px at ${at.x}px ${at.y}px)`]
  t.ready
    .then(() =>
      doc.animate(
        { clipPath: closing ? frames.reverse() : frames },
        {
          duration: closing ? 480 : 640,
          easing: closing ? 'cubic-bezier(0.7, 0, 0.84, 0)' : 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: closing ? '::view-transition-old(root)' : '::view-transition-new(root)',
        },
      ),
    )
    .catch(() => {})
  t.finished.finally(() => doc.classList.remove('vt-closing')).catch(() => {})
}

/**
 * Everything behind the sign-in: which app is showing, and the pomodoro timer.
 * The timer lives here rather than in the focus app so a round keeps running —
 * and chimes, and asks what got done — while you are looking at your tasks.
 */
function SignedIn({ email }: { email: string | null }) {
  const [route, setRoute] = useState(readRoute)
  // Where the last app was opened from, so going home closes back into it.
  const origin = useRef<Point | null>(null)

  const { data } = useBoard()
  const saveRound = useSaveRound()
  const deleteRound = useDeleteRound()
  const [logging, setLogging] = useState<string | null>(null)

  const timer = usePomodoro((round) => {
    // Recorded the moment it ends; the editor only adds detail. Closing it
    // unanswered still leaves the round counted.
    saveRound.mutate({ ...round, goalId: null, tagId: null, notes: null })
    setLogging(round.id)
  })

  const show = (next: Route) =>
    circleTransition(
      () => setRoute(next),
      origin.current ?? { x: innerWidth / 2, y: innerHeight / 2 },
      next === 'hub',
    )

  const go = (next: Route, from?: Element) => {
    if (from) origin.current = centerOf(from)
    history.pushState(null, '', next === 'hub' ? location.pathname + location.search : `#${next}`)
    show(next)
  }

  // Back and forward replay the same circle.
  useEffect(() => {
    const onPop = () => show(readRoute())
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])

  const rounds = data?.rounds ?? []
  const loggingRound = logging ? rounds.find((r) => r.id === logging) : undefined
  // The round before this one: consecutive rounds are usually on the same
  // thing, so its goal and subject are offered as the starting point.
  const previous = loggingRound
    ? rounds
        .filter((r) => r.startedAt < loggingRound.startedAt)
        .reduce<(typeof rounds)[number] | undefined>(
          (best, r) => (!best || r.startedAt > best.startedAt ? r : best),
          undefined,
        )
    : undefined

  return (
    <>
      {route === 'hub' ? (
        <Hub email={email} timer={timer} onOpen={go} />
      ) : route === 'tasks' ? (
        <Board email={email} timer={timer} onHome={() => go('hub')} onTimer={(el) => go('focus', el)} />
      ) : (
        <FocusApp email={email} timer={timer} onHome={() => go('hub')} />
      )}

      {loggingRound && data && (
        <RoundEditor
          key={loggingRound.id}
          mode="finished"
          round={loggingRound}
          suggest={previous}
          goals={data.goals}
          tags={data.tags}
          onSave={(r) => saveRound.mutate(r)}
          onDelete={() => deleteRound.mutate(loggingRound.id)}
          onClose={() => setLogging(null)}
        />
      )}
    </>
  )
}

/* ----------------------------------------------------------------- tasks --- */

interface BoardProps {
  email: string | null
  timer: Pomodoro
  onHome: () => void
  onTimer: (from: Element) => void
}

function Board({ email, timer, onHome, onTimer }: BoardProps) {
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
      <AppHeader
        app="Tasks"
        email={email}
        onHome={onHome}
        timer={timer}
        onTimer={(e) => onTimer(e.currentTarget)}
        tabs={
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
        }
        action={
          <button type="button" className="btn btn-primary" onClick={() => setEditingId('new')}>
            New task
          </button>
        }
      />

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

      <main key={view} className={cx(styles.main, view === 'circles' && styles.mainCircles, 'enter')}>
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
