import { endOfDay, format, isSameDay, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import appStyles from '../../App.module.css'
import {
  DAY_MIN,
  RANGES,
  TRAY_MODES,
  atMinute,
  blockFor,
  blockSpan,
  canPlaceOn,
  cardMinutes,
  dropSpan,
  formatMinute,
  isBlockDone,
  occurrenceDayOf,
  rangeDays,
  trayTasks,
  type CalendarRange,
  type TrayMode,
} from '../../domain/calendar'
import { dayKey, parseDayKey } from '../../domain/deadlines'
import { indexOccurrences, toRingTask, type RingTask } from '../../domain/rings'
import type { Block, Task } from '../../domain/types'
import { cx } from '../../lib/cx'
import type { Board, TaskInput } from '../../lib/db'
import { taskFromInput } from '../../lib/localDb'
import { useBoard, useDeleteBlock, useSaveBlock, useSetTasksDone } from '../../lib/queries'
import { useNow } from '../../lib/useNow'
import type { Pomodoro } from '../../lib/usePomodoro'
import { AppHeader } from '../AppHeader'
import { ConnectedTaskEditor } from '../TaskEditor'
import { BlockEditor } from './BlockEditor'
import styles from './Calendar.module.css'
import { CalendarGrid, GUTTER_PX, HEAD_PX, type BlockGrab, type GridBlock } from './CalendarGrid'
import { CardBody, TaskTray } from './TaskTray'
import { useDrag } from './useDrag'

interface Props {
  email: string | null
  timer: Pomodoro
  onHome: () => void
  onTimer: (from: Element) => void
}

const EMPTY_BOARD: Board = { tasks: [], goals: [], tags: [], occurrences: [], rounds: [], blocks: [] }

type Editing = { id: string; slot?: { day: Date; startMin: number } }
type Scheduling = { taskId: string; blockId: string | null; day: Date }

/**
 * Plan the day by hand: the agenda on top, the work to fit into it underneath.
 * Cards are dragged up into slots, blocks are dragged between slots and days
 * and stretched from either edge, and anything can be done from a dialog
 * instead by clicking it.
 */
export function CalendarApp({ email, timer, onHome, onTimer }: Props) {
  const now = useNow()
  const { data, isPending, error } = useBoard()
  const board = data ?? EMPTY_BOARD
  const saveBlock = useSaveBlock()
  const deleteBlock = useDeleteBlock()
  const setTasksDone = useSetTasksDone()

  const [range, setRange] = useState<CalendarRange>('day')
  const [trayMode, setTrayMode] = useState<TrayMode>('overdue')
  const [scheduling, setScheduling] = useState<Scheduling | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [settled, setSettled] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  /*
   * The block just dropped, drawn from here until the cache has it. The
   * optimistic write lands a tick or two after the drop, and without this the
   * preview would vanish first and the block flash back to where it came from.
   */
  const [pending, setPending] = useState<Block | null>(null)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)

  // Keyed on the day, not the minute, so the columns are not rebuilt every tick.
  const today = dayKey(now)
  const days = useMemo(() => rangeDays(now, range), [today, range])

  const blocks = useMemo(
    () => (pending ? [...board.blocks.filter((b) => b.id !== pending.id), pending] : board.blocks),
    [board.blocks, pending],
  )

  const completedByTask = useMemo(() => indexOccurrences(board.occurrences), [board.occurrences])
  const taskById = useMemo(() => new Map(board.tasks.map((t) => [t.id, t])), [board.tasks])
  const goalMap = useMemo(() => new Map(board.goals.map((g) => [g.id, g])), [board.goals])
  const tagMap = useMemo(() => new Map(board.tags.map((t) => [t.id, t])), [board.tags])

  const resolved = useMemo(
    () => board.tasks.map((t) => toRingTask(t, now, completedByTask)).filter((t): t is RingTask => !!t),
    [board.tasks, now, completedByTask],
  )
  const tray = useMemo(() => trayTasks(resolved, trayMode), [resolved, trayMode])
  const counts = useMemo(
    () => Object.fromEntries(TRAY_MODES.map((m) => [m.id, trayTasks(resolved, m.id).length])) as Record<TrayMode, number>,
    [resolved],
  )

  const gridBlocks = useMemo(() => {
    const out: GridBlock[] = []
    for (const block of blocks) {
      const task = taskById.get(block.taskId)
      if (!task) continue
      const span = blockSpan(block)
      const dayIndex = days.findIndex((d) => isSameDay(d, span.day))
      if (dayIndex === -1) continue
      const done = isBlockDone(task, block, completedByTask)
      out.push({
        block,
        task,
        dayIndex,
        startMin: span.startMin,
        endMin: span.endMin,
        done,
        late: !task.recurrence && !done && parseISO(block.end) > parseISO(task.deadline),
      })
    }
    return out
  }, [blocks, taskById, days, completedByTask])

  /** The block a tray card stands for: the task's one block, or a habit's block on its next day. */
  const scheduledOf = (t: RingTask) =>
    blocks.find((b) => b.taskId === t.id && (!t.isRecurring || dayKey(parseISO(b.start)) === t.occurrenceDay))

  const place = (block: Block) => {
    setPending(block)
    setSettled(block.id)
    saveBlock.mutate(block, { onSettled: () => setPending((p) => (p === block ? null : p)) })
  }

  const blockAt = (taskId: string, id: string, day: Date, startMin: number, endMin: number): Block => ({
    id,
    taskId,
    start: atMinute(day, startMin).toISOString(),
    end: atMinute(day, endMin).toISOString(),
  })

  const drag = useDrag({
    scrollerRef,
    colsRef,
    dayCount: days.length,
    headPx: HEAD_PX,
    gutterPx: GUTTER_PX,
    resolve: (source, at) => {
      if (source.kind === 'resize') {
        const { day } = blockSpan(source.block)
        return { dayIndex: days.findIndex((d) => isSameDay(d, day)), ...dropSpan(source, day, at.minute, blocks) }
      }
      if (!at.inside) return null
      return { dayIndex: at.dayIndex, ...dropSpan(source, days[at.dayIndex], at.minute, blocks) }
    },
    onDrop: (source, t) => {
      const day = days[t.dayIndex]
      if (source.kind === 'card') {
        const id = blockFor(blocks, source.task, day)?.id ?? crypto.randomUUID()
        place(blockAt(source.task.id, id, day, t.startMin, t.endMin))
        return
      }
      const span = blockSpan(source.block)
      if (isSameDay(span.day, day) && span.startMin === t.startMin && span.endMin === t.endMin) return
      place(blockAt(source.task.id, source.block.id, day, t.startMin, t.endMin))
    },
  })

  // The landing glow, and the no-slide that goes with it, last one beat.
  useEffect(() => {
    if (!settled) return
    const id = setTimeout(() => setSettled(null), 700)
    return () => clearTimeout(id)
  }, [settled])

  useEffect(() => {
    if (!fresh) return
    const id = setTimeout(() => setFresh(null), 1600)
    return () => clearTimeout(id)
  }, [fresh])

  const onCardDown = (e: PointerEvent<HTMLElement>, task: RingTask) =>
    drag.start(e, { kind: 'card', task, minutes: cardMinutes(blocks, task.id) })

  const onBlockDown = (e: PointerEvent<HTMLElement>, gb: GridBlock, grab: BlockGrab) => {
    if (grab !== 'move') {
      drag.start(e, { kind: 'resize', task: gb.task, block: gb.block, edge: grab })
      return
    }
    const r = colsRef.current?.getBoundingClientRect()
    const minute = r ? ((e.clientY - r.top) / r.height) * DAY_MIN : gb.startMin
    drag.start(e, { kind: 'move', task: gb.task, block: gb.block, grabMin: minute - gb.startMin })
  }

  const setDone = (task: Task, occurrenceDay: string | null, done: boolean) =>
    setTasksDone.mutate({ items: [{ taskId: task.id, occurrenceDay }], done })

  /** A task created here is put where it can be seen: the tray tab that holds it, scrolled to. */
  const reveal = (id: string, input: TaskInput) => {
    setTrayMode(input.recurrence ? 'recurring' : parseISO(input.deadline) < now ? 'overdue' : 'deadline')
    setFresh(id)
  }

  const onCreated = (id: string, input: TaskInput) => {
    const slot = editing?.slot
    if (slot && canPlaceOn(taskFromInput(input, id), slot.day)) {
      place(blockAt(id, crypto.randomUUID(), slot.day, slot.startMin, Math.min(slot.startMin + 60, DAY_MIN)))
    } else reveal(id, input)
  }

  const schedTask = scheduling ? taskById.get(scheduling.taskId) : undefined
  const schedBlock = scheduling?.blockId ? (blocks.find((b) => b.id === scheduling.blockId) ?? null) : null
  const ghostTask =
    drag.active?.source.kind === 'card' ? resolved.find((t) => t.id === drag.active!.source.task.id) : undefined

  return (
    <div className={appStyles.app}>
      <AppHeader
        app="Calendar"
        email={email}
        onHome={onHome}
        timer={timer}
        onTimer={(e) => onTimer(e.currentTarget)}
        tabs={
          <div className="segmented">
            {RANGES.map((r) => (
              <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </button>
            ))}
          </div>
        }
        action={
          <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: 'new' })}>
            New task
          </button>
        }
      />

      <main className={cx(appStyles.main, styles.main)}>
        {error ? (
          <p className={appStyles.error}>{error.message}</p>
        ) : isPending ? (
          <p className="empty">Loading…</p>
        ) : (
          <>
            <div key={range} className={cx(styles.gridWrap, 'enter')}>
              <CalendarGrid
                days={days}
                now={now}
                blocks={gridBlocks}
                active={drag.active}
                target={drag.target}
                settled={settled}
                scrollerRef={scrollerRef}
                colsRef={colsRef}
                onBlockDown={onBlockDown}
                onOpen={(gb) => setScheduling({ taskId: gb.task.id, blockId: gb.block.id, day: blockSpan(gb.block).day })}
                onToggle={(gb, done) => setDone(gb.task, occurrenceDayOf(gb.task, gb.block), done)}
                onSlot={(day, startMin) => setEditing({ id: 'new', slot: { day, startMin } })}
              />
            </div>

            <TaskTray
              tasks={tray}
              mode={trayMode}
              counts={counts}
              onMode={setTrayMode}
              now={now}
              goals={goalMap}
              tags={tagMap}
              scheduledOf={scheduledOf}
              dragging={drag.active?.source.kind === 'card' ? drag.active.source.task.id : null}
              fresh={fresh}
              onCardDown={onCardDown}
              onOpen={(t) => {
                const block = scheduledOf(t)
                setScheduling({
                  taskId: t.id,
                  blockId: block?.id ?? null,
                  day: block ? blockSpan(block).day : t.occurrenceDay ? parseDayKey(t.occurrenceDay) : now,
                })
              }}
              onComplete={(t) => setDone(t, t.occurrenceDay, true)}
              onNewTask={() => setEditing({ id: 'new' })}
            />
          </>
        )}
      </main>

      {drag.active?.source.kind === 'card' &&
        ghostTask &&
        createPortal(
          <div key={drag.active.id} ref={drag.ghostRef} className={styles.ghost} aria-hidden="true">
            <div
              className={cx(styles.card, styles.ghostCard)}
              data-importance={ghostTask.importance}
              style={{ width: drag.active.rect.width } as CSSProperties}
            >
              <input type="checkbox" tabIndex={-1} data-recurring={ghostTask.isRecurring || undefined} readOnly />
              <span className={styles.cardMain}>
                <CardBody task={ghostTask} now={now} goals={goalMap} tags={tagMap} scheduled={scheduledOf(ghostTask)} />
              </span>
            </div>
          </div>,
          document.body,
        )}

      {scheduling && schedTask && (
        <BlockEditor
          key={`${scheduling.taskId}:${scheduling.blockId}`}
          task={schedTask}
          block={schedBlock}
          day={scheduling.day}
          now={now}
          blocks={blocks}
          onSave={(day, startMin, endMin) => {
            const id = schedBlock?.id ?? blockFor(blocks, schedTask, day)?.id ?? crypto.randomUUID()
            place(blockAt(schedTask.id, id, day, startMin, endMin))
          }}
          onUnschedule={schedBlock ? () => deleteBlock.mutate(schedBlock.id) : null}
          onEditTask={() => setEditing({ id: schedTask.id })}
          onClose={() => setScheduling(null)}
        />
      )}

      {editing && (
        <ConnectedTaskEditor
          key={editing.slot ? `new:${dayKey(editing.slot.day)}:${editing.slot.startMin}` : editing.id}
          id={editing.id}
          board={board}
          now={now}
          subtitle={
            editing.slot
              ? `${format(editing.slot.day, 'EEE d MMM')}, ${formatMinute(editing.slot.startMin)} – ${formatMinute(Math.min(editing.slot.startMin + 60, DAY_MIN))}`
              : undefined
          }
          initialDeadline={editing.slot ? endOfDay(editing.slot.day) : undefined}
          onCreated={onCreated}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
