import { addDays, format } from 'date-fns'
import { useMemo, useState, type CSSProperties } from 'react'
import {
  buildTrends,
  changePct,
  chartBars,
  matchesRound,
  NO_ROUND_FILTER,
  periodLabel,
  periodOf,
  shift,
  type RoundFilter,
  type TrendItem,
} from '../../domain/pomodoro'
import type { Goal, Round, Tag } from '../../domain/types'
import { cx } from '../../lib/cx'
import styles from './Focus.module.css'
import { Stepper } from './RoundsView'
import { formatMinutes } from './TimerView'

interface Props {
  rounds: Round[]
  goals: Goal[]
  tags: Tag[]
  now: Date
}

/** A round axis that lands on whole, readable steps. */
function axis(max: number): { top: number; step: number } {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : 10
  return { step, top: Math.max(step, Math.ceil(max / step) * step) }
}

export function PerformanceView({ rounds, goals, tags, now }: Props) {
  const [span, setSpan] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(now)
  const [filter, setFilter] = useState<RoundFilter>(NO_ROUND_FILTER)

  const shown = useMemo(() => rounds.filter((r) => matchesRound(r, filter)), [rounds, filter])
  const bars = chartBars(shown, span, anchor)
  const report = useMemo(
    () => buildTrends(shown, span, anchor, now, goals, tags),
    [shown, span, anchor, now, goals, tags],
  )

  const { top, step } = axis(Math.max(0, ...bars.map((b) => b.rounds)))
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)
  const period = periodOf(span, anchor)
  const showsToday = now >= period.start && now < period.end
  const [total, ...rest] = report.items
  const goalItems = rest.filter((i) => i.axis === 'goal')
  const subjectItems = rest.filter((i) => i.axis === 'subject')

  const toggle = (key: keyof RoundFilter, id: string) =>
    setFilter((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }))
  const filtering = filter.goalIds.length + filter.tagIds.length > 0

  if (rounds.length === 0) {
    return (
      <div className={styles.page}>
        <p className="empty">No rounds yet. Finish one on the timer, or log one under Rounds, and it shows up here.</p>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className="segmented">
          {(['week', 'month'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={span === s} onClick={() => setSpan(s)}>
              {s === 'week' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        <Stepper
          label={periodLabel(span, anchor)}
          onPrev={() => setAnchor(shift(span, anchor, -1))}
          onNext={() => setAnchor(shift(span, anchor, 1))}
          onToday={showsToday ? undefined : () => setAnchor(now)}
        />
      </div>

      {(goals.length > 0 || tags.length > 0) && (
        <div className={styles.filters}>
          {goals.map((g) => (
            <button
              key={g.id}
              type="button"
              className="chip"
              aria-pressed={filter.goalIds.includes(g.id)}
              onClick={() => toggle('goalIds', g.id)}
            >
              <span className="dot" style={{ background: `var(--tone-${g.color})` }} />
              {g.name}
            </button>
          ))}
          {goals.length > 0 && tags.length > 0 && <span className={styles.filterSep} />}
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={filter.tagIds.includes(t.id)}
              onClick={() => toggle('tagIds', t.id)}
            >
              <span className="dot dot-hollow" style={{ color: `var(--tone-${t.color})` }} />
              {t.name}
            </button>
          ))}
          {filtering && (
            <button type="button" className="btn btn-quiet" onClick={() => setFilter(NO_ROUND_FILTER)}>
              Clear
            </button>
          )}
        </div>
      )}

      <div key={`${span}-${period.start.toISOString()}`} className={cx(styles.stats, 'enter')}>
        <Stat
          label="Rounds"
          value={String(report.rounds)}
          before={report.previousRounds}
          now={report.rounds}
          note={`vs ${report.previousRounds} ${report.previousLabel}`}
        />
        <Stat
          label="Focused"
          value={`${total.hours} h`}
          before={total.previousHours}
          now={total.hours}
          note={`vs ${total.previousHours} h ${report.previousLabel}`}
        />
      </div>

      <figure className={styles.chart}>
        <figcaption className={styles.chartTitle}>
          Rounds per {span === 'week' ? 'day' : 'week'}
        </figcaption>
        <div className={styles.plot}>
          {ticks.map((v) => (
            <span key={v} className={styles.grid} style={{ bottom: `${(v / top) * 100}%` }}>
              <span className={cx(styles.gridLabel, 'tnum')}>{v}</span>
            </span>
          ))}
          <div className={styles.bars} style={{ '--n': bars.length } as CSSProperties}>
            {bars.map((b, i) => (
              <div
                key={b.start.toISOString()}
                className={styles.barCol}
                tabIndex={0}
                style={{ '--h': `${(b.rounds / top) * 100}%`, '--i': i } as CSSProperties}
                aria-label={`${b.label}: ${b.rounds} rounds`}
              >
                <span className={styles.barFill} />
                <span className={cx(styles.barTip, 'tnum')}>
                  <span>
                    <strong>{b.rounds}</strong> {b.rounds === 1 ? 'round' : 'rounds'} · {formatMinutes(b.minutes)}
                  </span>
                  <span>
                    {span === 'week'
                      ? format(b.start, 'EEE d MMM')
                      : `${format(b.start, 'd MMM')} – ${format(addDays(b.end, -1), 'd MMM')}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.xAxis} style={{ '--n': bars.length } as CSSProperties}>
          {bars.map((b) => (
            <span key={b.start.toISOString()}>{b.label}</span>
          ))}
        </div>
      </figure>

      <section className={styles.conclusions}>
        <h2 className={styles.heading}>Conclusions</h2>
        <p className={styles.lede}>{total.summary}</p>
        {goalItems.length > 0 && <TrendList title="Goals" items={goalItems} goals={goals} tags={tags} />}
        {subjectItems.length > 0 && <TrendList title="Subjects" items={subjectItems} goals={goals} tags={tags} />}
        {goalItems.length + subjectItems.length === 0 && (
          <p className={styles.hint}>
            Give rounds a goal or subject when you log them and the hours per goal show up here.
          </p>
        )}
      </section>
    </div>
  )
}

/** Arrow and number, so direction never rides on colour alone. */
function Delta({ before, now }: { before: number; now: number }) {
  const pct = changePct(now, before)
  if (pct === null) return now > 0 ? <span className={cx(styles.delta, styles.up)}>new</span> : null
  if (pct === 0) return <span className={styles.delta}>±0%</span>
  return (
    <span className={cx(styles.delta, pct > 0 ? styles.up : styles.down)}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  )
}

function Stat(props: { label: string; value: string; before: number; now: number; note: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{props.label}</span>
      <span className={cx(styles.statValue, 'tnum')}>{props.value}</span>
      <span className={styles.statNote}>
        <Delta before={props.before} now={props.now} /> {props.note}
      </span>
    </div>
  )
}

function TrendList({
  title,
  items,
  goals,
  tags,
}: {
  title: string
  items: TrendItem[]
  goals: Goal[]
  tags: Tag[]
}) {
  const tone = (i: TrendItem) =>
    (i.axis === 'goal' ? goals.find((g) => g.id === i.id) : tags.find((t) => t.id === i.id))?.color ?? 'sky'
  return (
    <div className={styles.trendGroup}>
      <h3 className={styles.trendTitle}>{title}</h3>
      <ul className={styles.trends}>
        {items.map((i, n) => (
          <li key={i.id} className={styles.trend} style={{ animationDelay: `${n * 50}ms` }}>
            <span className={styles.trendHead}>
              <span
                className={cx('dot', i.axis === 'subject' && 'dot-hollow')}
                style={
                  i.axis === 'goal' ? { background: `var(--tone-${tone(i)})` } : { color: `var(--tone-${tone(i)})` }
                }
              />
              <span className={styles.trendName}>{i.name}</span>
              <span className={cx(styles.trendHours, 'tnum')}>{i.hours} h</span>
              <Delta before={i.previousHours} now={i.hours} />
            </span>
            <span className={styles.trendText}>{i.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
