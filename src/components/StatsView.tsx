import { format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { describeRecurrence } from '../domain/recurrence'
import {
  buildStats,
  judged,
  onTimeRate,
  successRate,
  STATS_WINDOWS,
  type RecurringStats,
  type Tally,
} from '../domain/stats'
import type { Goal, Occurrence, Task } from '../domain/types'
import { cx } from '../lib/cx'
import styles from './StatsView.module.css'

interface Props {
  tasks: Task[]
  occurrences: Occurrence[]
  goals: Goal[]
  now: Date
  onOccurrenceReason: (taskId: string, day: string, reason: string | null) => void
}

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

export function StatsView({ tasks, occurrences, goals, now, onOccurrenceReason }: Props) {
  const [windowId, setWindowId] = useState('30')
  const [annotating, setAnnotating] = useState<{ taskId: string; day: string } | null>(null)

  const days = STATS_WINDOWS.find((w) => w.id === windowId)?.days ?? null
  const stats = useMemo(
    () => buildStats(tasks, occurrences, now, days),
    [tasks, occurrences, now, days],
  )

  const reasons = useMemo(() => {
    const map = new Map<string, string>()
    for (const o of occurrences) if (o.failureReason) map.set(`${o.taskId}@${o.date}`, o.failureReason)
    return map
  }, [occurrences])

  const reasonFor = (taskId: string, day: string) => reasons.get(`${taskId}@${day}`) ?? null

  const goalMap = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals])
  const goalRows = [...stats.byGoal]
    .map(([id, tally]) => ({ goal: goalMap.get(id), tally }))
    .filter((row): row is { goal: Goal; tally: Tally } => !!row.goal)
    .sort((a, b) => judged(b.tally) - judged(a.tally))

  if (judged(stats.overall) === 0) {
    return (
      <div className={styles.wrap}>
        <WindowPicker value={windowId} onChange={setWindowId} />
        <p className="empty">
          Nothing has come due in this window yet. Deadlines that pass are scored here.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <WindowPicker value={windowId} onChange={setWindowId} />

      {/* The headline: everything judged in the window, one number. */}
      <section className={styles.hero}>
        <Gauge tally={stats.overall} />
        <div className={styles.heroBody}>
          <h2 className={styles.heroTitle}>Success rate</h2>
          <p className={styles.heroNote}>
            {judged(stats.overall)} deadlines came due
            {stats.from && ` since ${format(stats.from, 'd MMM')}`}. Done on time or late both
            count as done; <strong>{pct(onTimeRate(stats.overall))}</strong> landed on time.
          </p>
          <div className={styles.legend}>
            <Stat label="On time" value={stats.overall.onTime} tone="ok" />
            <Stat label="Late" value={stats.overall.late} tone="warn" />
            <Stat label="Missed" value={stats.overall.missed} tone="bad" />
          </div>
        </div>
      </section>

      {/* One-off and recurring work fail for different reasons, so they are
          never averaged into a single number without also being shown apart. */}
      <section className={styles.split}>
        <SplitCard title="One-off tasks" tally={stats.oneOff} />
        <SplitCard title="Recurring" tally={stats.recurring} gold />
      </section>

      {stats.habits.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>Habits</h2>
          <p className={styles.sub}>
            One cell per day the rule fired. Click a missed day to say what happened.
          </p>
          <div className={styles.habits}>
            {stats.habits.map((habit) => (
              <HabitCard
                key={habit.task.id}
                habit={habit}
                annotatingDay={
                  annotating?.taskId === habit.task.id ? annotating.day : null
                }
                reasonFor={reasonFor}
                onAnnotate={(day) => setAnnotating(day ? { taskId: habit.task.id, day } : null)}
                onSave={(day, reason) => {
                  onOccurrenceReason(habit.task.id, day, reason)
                  setAnnotating(null)
                }}
              />
            ))}
          </div>
        </section>
      )}

      {goalRows.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>By goal</h2>
          <p className={styles.sub}>
            Every judged deadline counts once, so a daily habit weighs more than a single task.
          </p>
          <div className={styles.goals}>
            {goalRows.map(({ goal, tally }) => (
              <div key={goal.id} className={styles.goalRow}>
                <span className={styles.goalName}>
                  <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
                  {goal.name}
                </span>
                <span className={styles.bar}>
                  <span
                    className={styles.barFill}
                    style={{
                      width: `${(successRate(tally) ?? 0) * 100}%`,
                      background: `var(--tone-${goal.color})`,
                    }}
                  />
                </span>
                <span className={cx(styles.goalPct, 'tnum')}>{pct(successRate(tally))}</span>
                <span className={cx(styles.goalCount, 'tnum')}>
                  {tally.onTime + tally.late}/{judged(tally)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.heading}>Why things slipped</h2>
        <p className={styles.sub}>
          Your own notes on missed deadlines. This is the record a coaching analysis would read.
        </p>
        {stats.notes.length === 0 ? (
          <p className="empty">
            No reasons logged yet. Open a missed task, or click a missed day above, and say what
            got in the way.
          </p>
        ) : (
          <ul className={styles.notes}>
            {stats.notes.map((note) => (
              <li key={`${note.taskId}-${note.day ?? 'once'}`} className={styles.note}>
                <span className={styles.noteHead}>
                  <span className={styles.noteTitle}>{note.title}</span>
                  <span className={cx(styles.noteWhen, 'tnum')}>
                    {format(parseISO(note.at), 'EEE d MMM')}
                  </span>
                </span>
                <span className={styles.noteReason}>{note.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function WindowPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className={styles.picker}>
      <div className="segmented">
        {STATS_WINDOWS.map((w) => (
          <button
            key={w.id}
            type="button"
            aria-pressed={value === w.id}
            onClick={() => onChange(w.id)}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The app's own shape, reused: one ring, filled clockwise to the rate. Same
 * `pathLength=100` trick the circle view uses, so the arc is a percentage
 * directly and nothing has to compute a circumference.
 */
function Gauge({ tally }: { tally: Tally }) {
  const rate = successRate(tally)
  const done = (rate ?? 0) * 100
  const late = judged(tally) === 0 ? 0 : (tally.late / judged(tally)) * 100

  return (
    <svg className={styles.gauge} viewBox="-60 -60 120 120" role="img" aria-label={pct(rate)}>
      <circle className={styles.track} r={48} pathLength={100} />
      {/* Late is drawn over the done arc's tail, so the two read as one bar
          split by quality rather than as two competing rings. */}
      <circle
        className={styles.arc}
        r={48}
        pathLength={100}
        strokeDasharray={`${done} 100`}
        transform="rotate(-90)"
      />
      <circle
        className={styles.arcLate}
        r={48}
        pathLength={100}
        strokeDasharray={`${late} 100`}
        strokeDashoffset={-(done - late)}
        transform="rotate(-90)"
      />
      <text className={styles.gaugeText} textAnchor="middle" dominantBaseline="central" dy="1">
        {pct(rate)}
      </text>
    </svg>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={styles.stat} data-tone={tone}>
      <span className={cx(styles.statValue, 'tnum')}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </span>
  )
}

function SplitCard({ title, tally, gold }: { title: string; tally: Tally; gold?: boolean }) {
  const total = judged(tally)
  return (
    <div className={cx(styles.card, gold && styles.cardGold)}>
      <span className={styles.cardTitle}>{title}</span>
      <span className={cx(styles.cardPct, 'tnum')}>{pct(successRate(tally))}</span>
      <span className={styles.cardNote}>
        {total === 0
          ? 'nothing due'
          : `${tally.onTime + tally.late} of ${total} done${tally.late > 0 ? `, ${tally.late} late` : ''}`}
      </span>
    </div>
  )
}

interface HabitProps {
  habit: RecurringStats
  annotatingDay: string | null
  reasonFor: (taskId: string, day: string) => string | null
  onAnnotate: (day: string | null) => void
  onSave: (day: string, reason: string | null) => void
}

/**
 * The habit tracker. A "10k steps every day" task is not one deadline but
 * ninety, so the useful readout is the rate plus the shape of the misses —
 * a run of four bad days reads very differently from four scattered ones.
 */
function HabitCard({ habit, annotatingDay, reasonFor, onAnnotate, onSave }: HabitProps) {
  const total = habit.days.length
  const done = habit.done.size

  return (
    <div className={styles.habit}>
      <div className={styles.habitHead}>
        <span className={styles.habitTitle}>{habit.task.title}</span>
        <span className={styles.habitRule}>{describeRecurrence(habit.task.recurrence!)}</span>
        <span className={cx(styles.habitPct, 'tnum')}>{pct(successRate(habit.tally))}</span>
      </div>

      <div className={styles.strip}>
        {habit.days.map((day) => {
          const isDone = habit.done.has(day)
          const reason = reasonFor(habit.task.id, day)
          return (
            <button
              key={day}
              type="button"
              className={cx(
                styles.cell,
                isDone ? styles.cellDone : styles.cellMissed,
                reason && !isDone && styles.cellNoted,
                annotatingDay === day && styles.cellOpen,
              )}
              // Only a miss is worth explaining; a done day is not clickable.
              disabled={isDone}
              title={`${format(parseISO(day), 'EEE d MMM')} — ${isDone ? 'done' : 'missed'}${
                reason ? `: ${reason}` : ''
              }`}
              aria-label={`${day} ${isDone ? 'done' : 'missed'}`}
              onClick={() => onAnnotate(annotatingDay === day ? null : day)}
            />
          )
        })}
      </div>

      <div className={styles.habitMeta}>
        <span className="tnum">
          {done} of {total} days
        </span>
        <span className="tnum">Streak {habit.currentStreak}</span>
        <span className="tnum">Best {habit.bestStreak}</span>
      </div>

      {annotatingDay && (
        <ReasonForm
          day={annotatingDay}
          initial={reasonFor(habit.task.id, annotatingDay) ?? ''}
          onCancel={() => onAnnotate(null)}
          onSave={(reason) => onSave(annotatingDay, reason)}
        />
      )}
    </div>
  )
}

function ReasonForm({
  day,
  initial,
  onCancel,
  onSave,
}: {
  day: string
  initial: string
  onCancel: () => void
  onSave: (reason: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <form
      className={styles.reason}
      onSubmit={(e) => {
        e.preventDefault()
        onSave(value.trim() || null)
      }}
    >
      <label className="label" htmlFor={`reason-${day}`}>
        {format(parseISO(day), 'EEE d MMM')} — what got in the way?
      </label>
      <input
        id={`reason-${day}`}
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Travelling, ill, forgot…"
        autoFocus
      />
      <div className={styles.reasonActions}>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </div>
    </form>
  )
}
