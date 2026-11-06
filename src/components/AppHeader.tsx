import type { MouseEvent, ReactNode } from 'react'
import styles from '../App.module.css'
import { cx } from '../lib/cx'
import { db } from '../lib/db'
import { signOut } from '../lib/supabase'
import { formatClock, type Pomodoro } from '../lib/usePomodoro'

interface Props {
  app: string
  email: string | null
  onHome: () => void
  tabs: ReactNode
  action?: ReactNode
  /** While a round or break runs, a live chip that jumps to the timer. */
  timer?: Pomodoro
  onTimer?: (e: MouseEvent<HTMLButtonElement>) => void
}

/** Shared by every app in the suite, so moving between them never re-learns the chrome. */
export function AppHeader({ app, email, onHome, tabs, action, timer, onTimer }: Props) {
  return (
    <header className={styles.header}>
      <button type="button" className={styles.brand} onClick={onHome} title="Back to all circles">
        <span className={styles.brandMark} aria-hidden="true" />
        Circles<span className={styles.brandApp}>{app}</span>
      </button>

      {tabs}

      <span className={styles.spacer} />

      {timer && onTimer && timer.phase !== 'idle' && <TimerChip timer={timer} onClick={onTimer} />}

      <Account email={email} />
      {action}
    </header>
  )
}

export function TimerChip({ timer, onClick }: { timer: Pomodoro; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      className={cx(styles.timerChip, timer.phase === 'break' && styles.timerBreak)}
      onClick={onClick}
      title="Open the timer"
    >
      <svg viewBox="-10 -10 20 20" aria-hidden="true">
        <circle r={8} className={styles.timerTrack} />
        <circle
          r={8}
          pathLength={100}
          strokeDasharray={`${timer.progress * 100} 100`}
          transform="rotate(-90)"
          className={styles.timerArc}
        />
      </svg>
      <span className="tnum">{timer.paused ? 'Paused' : formatClock(timer.remainingMs)}</span>
    </button>
  )
}

export function Account({ email }: { email: string | null }) {
  if (db.kind === 'local') {
    return (
      <span className={styles.notice} title="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync">
        This browser only
      </span>
    )
  }
  return (
    <>
      {email && <span className={styles.account}>{email}</span>}
      <button type="button" className="btn btn-quiet" onClick={() => void signOut()}>
        Sign out
      </button>
    </>
  )
}
