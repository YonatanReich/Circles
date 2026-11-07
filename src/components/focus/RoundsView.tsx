import { addMinutes, format, isSameDay, isSameMonth, parseISO, set } from 'date-fns'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  calendarDays,
  inPeriod,
  periodLabel,
  periodOf,
  roundsOn,
  shift,
  type Span,
} from '../../domain/pomodoro'
import type { Goal, Round, Tag } from '../../domain/types'
import { cx } from '../../lib/cx'
import styles from './Focus.module.css'
import { RoundEditor } from './RoundEditor'
import { formatMinutes } from './TimerView'

interface Props {
  rounds: Round[]
  goals: Goal[]
  tags: Tag[]
  now: Date
  defaultMinutes: number
  onSave: (round: Round) => void
  onDelete: (id: string) => void
}

const SPANS: { id: Span; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

interface Hover {
  round: Round
  rect: DOMRect
  /** True when moving straight from another round: the card glides over. */
  glide: boolean
}

export function RoundsView({ rounds, goals, tags, now, defaultMinutes, onSave, onDelete }: Props) {
  const [span, setSpan] = useState<Span>('day')
  const [anchor, setAnchor] = useState(now)
  const [editing, setEditing] = useState<{ round: Round; mode: 'edit' | 'new' } | null>(null)

  const [hover, setHover] = useState<Hover | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = (round: Round, el: Element) => {
    clearTimeout(hideTimer.current)
    setHover((h) => ({ round, rect: el.getBoundingClientRect(), glide: h !== null }))
  }
  // A beat of grace, so sliding from one round to the next never blinks.
  const hide = () => {
    hideTimer.current = setTimeout(() => setHover(null), 120)
  }
  // Switching span or period unmounts the hovered round without a mouseleave,
  // which would strand the card over the new layout.
  useEffect(() => setHover(null), [span, anchor])

  const goalMap = new Map(goals.map((g) => [g.id, g]))
  const tagMap = new Map(tags.map((t) => [t.id, t]))
  const toneOf = (r: Round) => {
    const g = r.goalId ? goalMap.get(r.goalId) : undefined
    return g ? `var(--tone-${g.color})` : 'var(--neon)'
  }

  const period = periodOf(span, anchor)
  const inside = inPeriod(rounds, period)
  const total = inside.reduce((s, r) => s + r.minutes, 0)
  const showsToday = now >= period.start && now < period.end

  const openDay = (day: Date) => {
    setAnchor(day)
    setSpan('day')
  }

  const addRound = (day: Date) => {
    const start = isSameDay(day, now)
      ? addMinutes(now, -defaultMinutes)
      : set(day, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 })
    setEditing({
      mode: 'new',
      round: {
        id: crypto.randomUUID(),
        startedAt: start.toISOString(),
        minutes: defaultMinutes,
        goalId: null,
        tagId: null,
        notes: null,
      },
    })
  }

  const dot = (r: Round, size: 'lg' | 'md' | 'sm', label?: string) => (
    <button
      key={r.id}
      type="button"
      className={cx(styles.round, styles[size])}
      style={{ '--tone': toneOf(r) } as CSSProperties}
      aria-label={`Round at ${format(parseISO(r.startedAt), 'HH:mm')}`}
      onMouseEnter={(e) => show(r, e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(r, e.currentTarget)}
      onBlur={hide}
      onClick={() => {
        setHover(null)
        setEditing({ mode: 'edit', round: r })
      }}
    >
      {label}
    </button>
  )

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className="segmented">
          {SPANS.map((s) => (
            <button key={s.id} type="button" aria-pressed={span === s.id} onClick={() => setSpan(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <Stepper
          label={periodLabel(span, anchor)}
          onPrev={() => setAnchor(shift(span, anchor, -1))}
          onNext={() => setAnchor(shift(span, anchor, 1))}
          onToday={showsToday ? undefined : () => setAnchor(now)}
        />
        <span className={styles.grow} />
        <button type="button" className="btn" onClick={() => addRound(span === 'day' ? anchor : now)}>
          Log a round
        </button>
      </div>

      <p className={cx(styles.summary, 'tnum')}>
        <strong>{inside.length}</strong> {inside.length === 1 ? 'round' : 'rounds'}
        <span className={styles.summarySep} />
        {formatMinutes(total)} focused
      </p>

      {/* Keyed by span and period, so changing either replays the entrance. */}
      <div key={`${span}-${periodLabel(span, anchor)}`} className="enter">
        {span === 'day' ? (
          <div className={styles.dayGrid}>
            {roundsOn(rounds, anchor).map((r, i) => (
              <div key={r.id} className={styles.dayItem} style={{ animationDelay: `${i * 45}ms` }}>
                {dot(r, 'lg', String(i + 1))}
                <span className={cx(styles.dayTime, 'tnum')}>{format(parseISO(r.startedAt), 'HH:mm')}</span>
              </div>
            ))}
            <div className={styles.dayItem}>
              <button type="button" className={styles.addRound} onClick={() => addRound(anchor)} aria-label="Log a round">
                +
              </button>
              <span className={styles.dayTime}>add</span>
            </div>
          </div>
        ) : (
          <div className={cx(styles.calendar, span === 'week' ? styles.week : styles.month)}>
            {calendarDays(span, anchor)
              .slice(0, 7)
              .map((d) => (
                <span key={`h${d.getDay()}`} className={styles.weekday}>
                  {format(d, 'EEE')}
                </span>
              ))}
            {calendarDays(span, anchor).map((d) => {
              const list = roundsOn(rounds, d)
              return (
                <div
                  key={d.toISOString()}
                  className={cx(
                    styles.cell,
                    isSameDay(d, now) && styles.cellToday,
                    span === 'month' && !isSameMonth(d, anchor) && styles.cellOutside,
                  )}
                >
                  <button type="button" className={styles.cellDay} onClick={() => openDay(d)}>
                    <span className="tnum">{format(d, 'd')}</span>
                    {list.length > 0 && <span className={cx(styles.cellCount, 'tnum')}>{list.length}</span>}
                  </button>
                  <div className={styles.cellDots}>{list.map((r) => dot(r, span === 'week' ? 'md' : 'sm'))}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <HoverCard hover={hover} goals={goalMap} tags={tagMap} />

      {editing && (
        <RoundEditor
          key={editing.round.id}
          mode={editing.mode}
          round={editing.round}
          goals={goals}
          tags={tags}
          onSave={onSave}
          onDelete={editing.mode === 'edit' ? () => onDelete(editing.round.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

export function Stepper({
  label,
  onPrev,
  onNext,
  onToday,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday?: () => void
}) {
  return (
    <div className={styles.stepper}>
      <button type="button" className={cx('btn btn-quiet', styles.arrow)} onClick={onPrev} aria-label="Previous">
        ‹
      </button>
      <span className={cx(styles.stepLabel, 'tnum')}>{label}</span>
      <button type="button" className={cx('btn btn-quiet', styles.arrow)} onClick={onNext} aria-label="Next">
        ›
      </button>
      {onToday && (
        <button type="button" className="btn btn-quiet" onClick={onToday}>
          Today
        </button>
      )}
    </div>
  )
}

const CARD_HALF = 150

/**
 * One card for every round on screen, positioned against whichever is hovered.
 * Moving between rounds slides it across rather than blinking it out and in;
 * arriving from nothing it just blooms in place.
 */
function HoverCard({
  hover,
  goals,
  tags,
}: {
  hover: Hover | null
  goals: Map<string, Goal>
  tags: Map<string, Tag>
}) {
  // Holds the last round shown, so the card can fade out still showing it.
  const last = useRef<Hover | null>(null)
  if (hover) last.current = hover
  const h = last.current
  if (!h) return null

  const r = h.round
  const start = parseISO(r.startedAt)
  const goal = r.goalId ? goals.get(r.goalId) : undefined
  const tag = r.tagId ? tags.get(r.tagId) : undefined
  const above = h.rect.top > 230
  const left = Math.min(Math.max(h.rect.left + h.rect.width / 2, CARD_HALF + 8), innerWidth - CARD_HALF - 8)

  return (
    <div
      role="tooltip"
      className={cx(
        styles.card,
        above ? styles.cardAbove : styles.cardBelow,
        hover && styles.cardOn,
        hover?.glide && styles.cardGlide,
      )}
      style={{ left, top: above ? h.rect.top - 12 : h.rect.bottom + 12 }}
    >
      <div className={cx(styles.cardHead, 'tnum')}>
        <span>
          {format(start, 'HH:mm')} – {format(addMinutes(start, r.minutes), 'HH:mm')}
        </span>
        <span className={styles.cardMins}>{r.minutes} min</span>
      </div>
      {(goal || tag) && (
        <div className={styles.cardTags}>
          {goal && (
            <span>
              <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
              {goal.name}
            </span>
          )}
          {tag && (
            <span>
              <span className="dot dot-hollow" style={{ color: `var(--tone-${tag.color})` }} />
              {tag.name}
            </span>
          )}
        </div>
      )}
      <p className={cx(styles.cardNotes, !r.notes && styles.cardEmpty)}>
        {r.notes ?? 'Nothing written down. Click to add what you did.'}
      </p>
    </div>
  )
}
