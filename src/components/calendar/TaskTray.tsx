import { parseISO } from 'date-fns'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { TRAY_MODES, type TrayMode } from '../../domain/calendar'
import { formatDeadline } from '../../domain/deadlines'
import { describeRecurrence } from '../../domain/recurrence'
import type { RingTask } from '../../domain/rings'
import type { Block, Goal, Tag } from '../../domain/types'
import { cx } from '../../lib/cx'
import styles from './Calendar.module.css'

interface Props {
  tasks: RingTask[]
  mode: TrayMode
  counts: Record<TrayMode, number>
  onMode: (mode: TrayMode) => void
  now: Date
  goals: Map<string, Goal>
  tags: Map<string, Tag>
  scheduledOf: (task: RingTask) => Block | undefined
  /** The task whose card is out on the calendar right now. */
  dragging: string | null
  /** Just created: scrolled to and lit once. */
  fresh: string | null
  onCardDown: (e: PointerEvent<HTMLElement>, task: RingTask) => void
  onOpen: (task: RingTask) => void
  onComplete: (task: RingTask) => void
  onNewTask: () => void
}

/** A recurring task's card is per occurrence, so ticking one makes way for the next. */
const cardKey = (t: RingTask) => `${t.id}:${t.occurrenceDay ?? ''}`

/** Matches `--dur-ring`, the length of the card's exit in the stylesheet. */
const LEAVE_MS = 260

export function TaskTray({
  tasks,
  mode,
  counts,
  onMode,
  now,
  goals,
  tags,
  scheduledOf,
  dragging,
  fresh,
  onCardDown,
  onOpen,
  onComplete,
  onNewTask,
}: Props) {
  // Ticked cards fold away first and are completed once they have gone, so
  // the neighbours slide over instead of the row snapping shut.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set())
  const list = useRef<HTMLDivElement>(null)

  const complete = (task: RingTask) => {
    const key = cardKey(task)
    setLeaving((s) => new Set(s).add(key))
    const ms = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : LEAVE_MS
    setTimeout(() => {
      onComplete(task)
      setLeaving((s) => {
        const next = new Set(s)
        next.delete(key)
        return next
      })
    }, ms)
  }

  useEffect(() => {
    if (!fresh) return
    list.current
      ?.querySelector(`[data-task="${fresh}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [fresh, mode])

  return (
    <section className={styles.tray} aria-label="Tasks to schedule">
      <div className={styles.trayHead}>
        <div className="segmented">
          {TRAY_MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => onMode(m.id)}>
              {m.label}
              <span className={cx(styles.count, 'tnum', m.id === 'overdue' && counts.overdue > 0 && styles.countLate)}>
                {counts[m.id]}
              </span>
            </button>
          ))}
        </div>
        <span className={styles.hint}>
          <span className={styles.hintFine}>Drag a card onto the calendar</span>
          <span className={styles.hintCoarse}>Hold a card, then drag it up</span>
        </span>
      </div>

      {tasks.length === 0 ? (
        <div key={mode} className={cx(styles.trayEmpty, 'enter')}>
          {mode === 'overdue' ? (
            <>
              <span>Nothing overdue.</span>
              <button type="button" className="btn btn-quiet" onClick={() => onMode('deadline')}>
                See what is next
              </button>
            </>
          ) : (
            <>
              <span>{mode === 'recurring' ? 'No recurring tasks.' : 'No open tasks.'}</span>
              <button type="button" className="btn btn-quiet" onClick={onNewTask}>
                New task
              </button>
            </>
          )}
        </div>
      ) : (
        <div
          key={mode}
          ref={list}
          className={styles.cards}
          // A vertical wheel has nothing else to do here, so it scrolls the row.
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
          }}
        >
          {tasks.map((task, i) => {
            const key = cardKey(task)
            const gone = leaving.has(key)
            return (
              <div
                key={key}
                data-task={task.id}
                className={styles.card}
                data-importance={task.importance}
                data-placeholder={dragging === task.id || undefined}
                data-leaving={gone || undefined}
                data-fresh={fresh === task.id || undefined}
                style={{ '--i': Math.min(i, 8) } as CSSProperties}
                onPointerDown={(e) => onCardDown(e, task)}
              >
                <input
                  type="checkbox"
                  checked={gone}
                  disabled={gone}
                  data-recurring={task.isRecurring || undefined}
                  onChange={() => complete(task)}
                  aria-label={`Complete ${task.title}`}
                />
                <button type="button" className={styles.cardMain} onClick={() => onOpen(task)}>
                  <CardBody task={task} now={now} goals={goals} tags={tags} scheduled={scheduledOf(task)} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface BodyProps {
  task: RingTask
  now: Date
  goals: Map<string, Goal>
  tags: Map<string, Tag>
  scheduled: Block | undefined
}

/** A card's contents — shared by the tray and the ghost that follows the pointer. */
export function CardBody({ task, now, goals, tags, scheduled }: BodyProps) {
  const labels = [
    ...task.goalIds.map((id) => goals.get(id)).filter((g): g is Goal => !!g).map((g) => ({ ...g, hollow: false })),
    ...task.tagIds.map((id) => tags.get(id)).filter((t): t is Tag => !!t).map((t) => ({ ...t, hollow: true })),
  ]

  return (
    <>
      <span className={styles.cardTitle}>{task.title}</span>
      <span className={styles.cardMeta}>
        <span className={cx('tnum', task.isOverdue && styles.overdue)}>
          {formatDeadline(task.effectiveDeadline, now)}
        </span>
        {task.recurrence && (
          <span className={styles.cardRepeat}>
            <span className="dot" style={{ background: 'var(--gold)' }} />
            {describeRecurrence(task.recurrence)}
          </span>
        )}
      </span>
      {labels.length > 0 && (
        <span className={styles.cardLabels}>
          {labels.map((l) => (
            <span key={l.id} className={styles.cardLabel}>
              <span
                className={cx('dot', l.hollow && 'dot-hollow')}
                style={l.hollow ? { color: `var(--tone-${l.color})` } : { background: `var(--tone-${l.color})` }}
              />
              {l.name}
            </span>
          ))}
        </span>
      )}
      {scheduled && (
        <span className={cx(styles.cardScheduled, 'tnum')}>
          <ClockGlyph />
          {formatDeadline(parseISO(scheduled.start), now)}
        </span>
      )}
    </>
  )
}

/** The suite's ring, with one quarter lit: a slot taken on the dial. */
function ClockGlyph() {
  return (
    <svg viewBox="-6 -6 12 12" aria-hidden="true" className={styles.clock}>
      <circle r={4.5} opacity={0.4} />
      <circle r={4.5} pathLength={100} strokeDasharray="25 100" transform="rotate(-90)" />
    </svg>
  )
}
