import { useState } from 'react'
import { roundsOn } from '../../domain/pomodoro'
import type { Goal, Round } from '../../domain/types'
import { cx } from '../../lib/cx'
import { formatClock, type Pomodoro } from '../../lib/usePomodoro'
import styles from './Focus.module.css'

interface Props {
  timer: Pomodoro
  rounds: Round[]
  goals: Goal[]
  now: Date
  onShowRounds: () => void
}

const R = 160

export function TimerView({ timer, rounds, goals, now, onShowRounds }: Props) {
  const today = roundsOn(rounds, now)
  const minutesToday = today.reduce((s, r) => s + r.minutes, 0)
  const goalTone = new Map(goals.map((g) => [g.id, g.color]))
  const { phase, paused } = timer

  const label = phase === 'idle' ? 'Ready' : paused ? 'Paused' : phase === 'work' ? 'Focus' : 'Break'
  const primary = phase === 'idle' ? timer.start : paused ? timer.resume : timer.pause
  const primaryLabel = phase === 'idle' ? 'Start focus' : paused ? 'Resume' : 'Pause'

  return (
    <div className={styles.timerView}>
      {/* The dial is itself the main control, so the biggest thing on screen
          does the most common thing. The buttons below say the same in words. */}
      <button
        type="button"
        className={cx(
          styles.dial,
          phase === 'break' && styles.dialBreak,
          phase !== 'idle' && !paused && styles.dialLive,
        )}
        onClick={primary}
        aria-label={primaryLabel}
      >
        <svg viewBox="-200 -200 400 400" aria-hidden="true">
          {/* Sixty ticks round the rim: one dashed circle, no loop. */}
          <circle className={styles.ticks} r={R + 22} pathLength={60} strokeDasharray="0.06 0.94" />
          <circle className={styles.track} r={R} />
          {/* Not drawn at rest: a zero-length dash with a round cap still paints a dot. */}
          {phase !== 'idle' && (
            <>
              <circle
                className={styles.arc}
                r={R}
                pathLength={100}
                strokeDasharray={`${timer.progress * 100} 100`}
                transform="rotate(-90)"
              />
              <g className={styles.headGroup} style={{ transform: `rotate(${timer.progress * 360}deg)` }}>
                <circle className={styles.head} cy={-R} r={7} />
              </g>
            </>
          )}
        </svg>
        <span className={styles.readout}>
          <span className={styles.phase}>{label}</span>
          <span className={cx(styles.clock, 'tnum')}>{formatClock(timer.remainingMs)}</span>
          <span className={styles.sub}>
            {phase === 'break'
              ? 'Breathe. Log what you did.'
              : phase === 'work'
                ? `Round ${today.length + 1} today`
                : today.length > 0
                  ? `${today.length} done today`
                  : 'Click to begin'}
          </span>
        </span>
      </button>

      <div className={styles.controls}>
        <button type="button" className="btn btn-primary" onClick={primary}>
          {primaryLabel}
        </button>
        {phase !== 'idle' && (
          <button
            type="button"
            className="btn"
            onClick={timer.stop}
            title={phase === 'work' ? 'Stop without counting this round' : undefined}
          >
            {phase === 'work' ? 'Stop' : 'Skip break'}
          </button>
        )}
      </div>

      <Durations timer={timer} />

      <button type="button" className={styles.todayStrip} onClick={onShowRounds}>
        <span className={styles.todayDots}>
          {today.length === 0 ? (
            <span className={cx(styles.miniDot, styles.miniEmpty)} />
          ) : (
            today.map((r, i) => (
              <span
                key={r.id}
                className={styles.miniDot}
                style={{
                  ['--tone' as string]: r.goalId ? `var(--tone-${goalTone.get(r.goalId) ?? 'sky'})` : 'var(--neon)',
                  animationDelay: `${i * 40}ms`,
                }}
              />
            ))
          )}
        </span>
        <span className="tnum">
          {today.length === 0
            ? 'No rounds yet today'
            : `${today.length} ${today.length === 1 ? 'round' : 'rounds'} · ${formatMinutes(minutesToday)} today`}
        </span>
      </button>
    </div>
  )
}

export const formatMinutes = (m: number) =>
  m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`

/** Editable only between rounds — changing the length mid-round would move the goalposts. */
function Durations({ timer }: { timer: Pomodoro }) {
  const [work, setWork] = useState(String(timer.workMin))
  const [rest, setRest] = useState(String(timer.breakMin))
  const locked = timer.phase !== 'idle'

  const commit = (w: string, b: string) => {
    const wn = Math.round(Number(w))
    const bn = Math.round(Number(b))
    if (wn >= 1 && wn <= 180 && bn >= 1 && bn <= 60) timer.setDurations(wn, bn)
  }

  return (
    <div className={styles.durations}>
      <label className={styles.duration}>
        <span>Focus</span>
        <input
          type="number"
          className="input tnum"
          min={1}
          max={180}
          value={work}
          disabled={locked}
          onChange={(e) => {
            setWork(e.target.value)
            commit(e.target.value, rest)
          }}
        />
        <span>min</span>
      </label>
      <span className={styles.durationSep} />
      <label className={styles.duration}>
        <span>Break</span>
        <input
          type="number"
          className="input tnum"
          min={1}
          max={60}
          value={rest}
          disabled={locked}
          onChange={(e) => {
            setRest(e.target.value)
            commit(work, e.target.value)
          }}
        />
        <span>min</span>
      </label>
    </div>
  )
}
