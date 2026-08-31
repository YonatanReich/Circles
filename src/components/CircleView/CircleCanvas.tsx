import { useMemo, type CSSProperties } from 'react'
import { DEFAULT_LAYOUT, goldColor, layoutRings, overdueColor, ringColor } from '../../domain/geometry'
import type { Ring } from '../../domain/rings'
import { cx } from '../../lib/cx'
import { halfMatches, type Filters } from '../../lib/filters'
import styles from './CircleCanvas.module.css'
import type { Hover, RingHalf } from './types'

interface Props {
  rings: Ring[]
  filters: Filters
  now: Date
  hover: Hover | null
  onHover: (hover: Hover | null) => void
  onOpen: (ringKey: string, half: RingHalf) => void
}

const VIEW = 680
const HALF_DASH = '50 50'
/** How far a hovered band swells. Outward only — see the paint-order note. */
const GROW = 7

export function CircleCanvas({ rings, filters, now, hover, onHover, onOpen }: Props) {
  const layout = useMemo(
    () => layoutRings(rings.map((r) => ({ key: r.key, count: r.count }))),
    [rings],
  )

  const overdueRing = rings.find((r) => r.isOverdue)
  const todayRing = rings.find((r) => r.isToday)

  const hoveredRing = hover ? rings.find((r) => r.key === hover.key) : undefined
  const hoveredCount =
    hoveredRing && hover
      ? hover.half === 'recurring'
        ? hoveredRing.recurringTasks.length
        : hoveredRing.tasks.length
      : 0

  /*
   * Painted outermost first so the innermost band ends up on top. A hovered
   * band grows outward only, over a neighbour that was painted earlier, so the
   * swell is never clipped by the ring outside it.
   */
  const painted = rings.map((ring, i) => ({ ring, l: layout[i] })).reverse()

  return (
    <div className={styles.wrap}>
      <svg
        className={styles.svg}
        viewBox={`${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`}
        onMouseLeave={() => onHover(null)}
      >
        {painted.map(({ ring, l }) => {
          if (!l) return null

          const split = ring.recurringTasks.length > 0
          const halves: RingHalf[] = split ? ['regular', 'recurring'] : ['regular']

          return halves.map((half) => {
            const dimmed = !halfMatches(ring, half, filters, now)
            const color =
              half === 'recurring'
                ? goldColor(dimmed)
                : ring.isOverdue
                  ? overdueColor(dimmed)
                  : ringColor(l.depth, dimmed)
            const active = hover?.key === ring.key && hover.half === half
            const empty = ring.count === 0

            return (
              <circle
                key={`${ring.key}-${half}`}
                className={cx(styles.band, active && styles.active, empty && styles.emptyBand)}
                // Grows outward: the inner edge stays put while the width rises.
                r={active ? l.radius + GROW / 2 : l.radius}
                pathLength={100}
                stroke={color}
                strokeWidth={active ? l.thickness + GROW : l.thickness}
                strokeDasharray={split ? HALF_DASH : undefined}
                // Rotated so the seam is vertical: gold covers 12→6, regular 6→12.
                strokeDashoffset={split && half === 'regular' ? -50 : undefined}
                transform={split ? 'rotate(-90)' : undefined}
                style={{ '--ring-color': color } as CSSProperties}
                role={empty ? undefined : 'button'}
                tabIndex={empty ? undefined : 0}
                aria-label={
                  empty
                    ? undefined
                    : `${ring.label}, ${
                        half === 'recurring' ? ring.recurringTasks.length : ring.tasks.length
                      } ${half === 'recurring' ? 'recurring tasks' : 'tasks'}`
                }
                onMouseEnter={() => !empty && onHover({ key: ring.key, half })}
                onFocus={() => !empty && onHover({ key: ring.key, half })}
                onClick={() => !empty && onOpen(ring.key, half)}
                onKeyDown={(e) => {
                  if (!empty && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onOpen(ring.key, half)
                  }
                }}
              />
            )
          })
        })}

        {/* Last, so the innermost band can swell without touching the readout. */}
        <circle className={styles.core} r={DEFAULT_LAYOUT.innerRadius - 10} />

        {hoveredRing && hover ? (
          <>
            <text className={styles.coreValue} y={-6}>
              {hoveredCount}
            </text>
            <text className={styles.coreLabel} y={16}>
              {hover.half === 'recurring' ? 'recurring' : 'tasks'}
            </text>
            <text className={cx(styles.coreLabel, styles.coreWhen)} y={34}>
              {hoveredRing.label.toLowerCase()}
            </text>
          </>
        ) : (
          <>
            <text className={styles.coreValue} y={-2}>
              {todayRing?.count ?? 0}
            </text>
            <text className={styles.coreLabel} y={20}>
              due today
            </text>
            {overdueRing && (
              <text className={cx(styles.coreLabel, styles.coreOverdue)} y={38}>
                {overdueRing.count} overdue
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  )
}
