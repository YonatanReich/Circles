import { format } from 'date-fns'
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { roundsOn } from '../domain/pomodoro'
import { buildRings, indexOccurrences } from '../domain/rings'
import { cx } from '../lib/cx'
import { useBoard } from '../lib/queries'
import { useNow } from '../lib/useNow'
import { formatClock, type Pomodoro } from '../lib/usePomodoro'
import { Account } from './AppHeader'
import styles from './Hub.module.css'

interface Props {
  email: string | null
  timer: Pomodoro
  onOpen: (app: 'tasks' | 'focus', from: Element) => void
}

/**
 * The suite's front door: one floating circle per app, each carrying a live
 * number so the hub is worth a glance even when you are not going anywhere.
 * Clicking one opens the app as a circle expanding out of it.
 */
export function Hub({ email, timer, onOpen }: Props) {
  const now = useNow()
  const { data } = useBoard()

  const due = useMemo(() => {
    if (!data) return null
    const rings = buildRings(data.tasks, now, indexOccurrences(data.occurrences))
    return {
      today: rings.find((r) => r.isToday)?.count ?? 0,
      overdue: rings.find((r) => r.isOverdue)?.count ?? 0,
    }
  }, [data, now])

  const roundsToday = data ? roundsOn(data.rounds, now).length : null
  const live = timer.phase !== 'idle'

  return (
    <div className={styles.hub}>
      <header className={styles.top}>
        <span className={styles.date}>{format(now, 'EEEE, d MMMM')}</span>
        <span className={styles.spacer} />
        <Account email={email} />
      </header>

      <div className={cx(styles.intro, 'enter')}>
        <h1 className={styles.brand}>Circles</h1>
        <p className={styles.tagline}>Where to?</p>
      </div>

      <div className={styles.orbs}>
        <Orb
          index={0}
          name="Tasks"
          value={due ? due.today : '–'}
          caption={
            <>
              due today
              {due && due.overdue > 0 && <span className={styles.alert}> · {due.overdue} overdue</span>}
            </>
          }
          glyph={<TasksGlyph />}
          onClick={(el) => onOpen('tasks', el)}
        />
        <Orb
          index={1}
          name="Focus"
          value={live ? (timer.paused ? 'Paused' : formatClock(timer.remainingMs)) : (roundsToday ?? '–')}
          caption={
            live
              ? timer.phase === 'work'
                ? 'focusing'
                : 'on a break'
              : roundsToday === 1
                ? 'round today'
                : 'rounds today'
          }
          glyph={<FocusGlyph progress={live ? timer.progress : 0.72} />}
          progress={live ? timer.progress : undefined}
          rest={timer.phase === 'break'}
          onClick={(el) => onOpen('focus', el)}
        />
      </div>
    </div>
  )
}

interface OrbProps {
  index: number
  name: string
  value: ReactNode
  caption: ReactNode
  glyph: ReactNode
  /** Drawn around the orb while a timer runs. */
  progress?: number
  rest?: boolean
  onClick: (el: Element) => void
}

function Orb({ index, name, value, caption, glyph, progress, rest, onClick }: OrbProps) {
  return (
    // The slot floats; the button inside it scales. Two elements, so the idle
    // bob and the hover lift never fight over one transform.
    <div className={styles.slot} style={{ '--i': index } as CSSProperties}>
      <button
        type="button"
        className={cx(styles.orb, rest && styles.rest)}
        onClick={(e) => onClick(e.currentTarget)}
      >
        <svg className={styles.orbit} viewBox="-50 -50 100 100" aria-hidden="true">
          <circle r={49.5} pathLength={100} />
        </svg>
        {progress !== undefined && (
          <svg className={styles.progress} viewBox="-50 -50 100 100" aria-hidden="true">
            <circle r={49.5} pathLength={100} strokeDasharray={`${progress * 100} 100`} transform="rotate(-90)" />
          </svg>
        )}
        <span className={styles.glyph}>{glyph}</span>
        <span className={styles.name}>{name}</span>
        <span className={cx(styles.value, 'tnum')}>{value}</span>
        <span className={styles.caption}>{caption}</span>
      </button>
    </div>
  )
}

/** The task app's own picture of itself: deadlines as nested rings. */
function TasksGlyph() {
  return (
    <svg viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r={17} opacity={0.35} />
      <circle r={11.5} opacity={0.6} />
      <circle r={6} />
    </svg>
  )
}

function FocusGlyph({ progress }: { progress: number }) {
  return (
    <svg viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r={15} opacity={0.3} />
      <circle r={15} pathLength={100} strokeDasharray={`${progress * 100} 100`} transform="rotate(-90)" />
      <circle r={2.5} className={styles.pip} />
    </svg>
  )
}
