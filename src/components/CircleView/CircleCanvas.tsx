import { useMemo, type CSSProperties } from 'react'
import { DEFAULT_LAYOUT, goldColor, layoutRings, overdueColor, ringColor } from '../../domain/geometry'
import type { Ring } from '../../domain/rings'
import { cx } from '../../lib/cx'
import { halfMatches, type Filters } from '../../lib/filters'
import { useElementWidth } from '../../lib/useElementWidth'
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

/** Real pixels the hub must span to seat the count and its two captions. */
const HUB_TARGET_PX = 124
/** Ring units between the hub disc and the innermost band. */
const HUB_INSET = 10

export function CircleCanvas({ rings, filters, now, hover, onHover, onOpen }: Props) {
  // The SVG itself, not its wrapper: the wrapper can be wider than the circle
  // once the 700px cap bites, and sizing the hub off the wrapper then draws the
  // readout for a larger disc than actually gets painted.
  const [svgRef, svgWidth] = useElementWidth<SVGSVGElement>()

  /*
   * The viewBox is fixed, so a circle rendered at 350px draws everything at
   * half scale — a hub sized in ring units would shrink to a coin on a phone.
   * The inner radius is therefore derived from the actual rendered width, which
   * keeps the hub roughly a constant number of real pixels and gives the
   * readout room at any size. Clamped so it never crowds the bands on a large
   * screen or leaves too little radius for them on a small one.
   */
  const scale = svgWidth > 0 ? svgWidth / VIEW : 1
  const innerRadius = Math.min(
    Math.max(DEFAULT_LAYOUT.innerRadius, HUB_TARGET_PX / 2 / scale + HUB_INSET),
    150,
  )

  const layout = useMemo(
    () =>
      layoutRings(
        rings.map((r) => ({ key: r.key, count: r.count })),
        { ...DEFAULT_LAYOUT, innerRadius },
      ),
    [rings, innerRadius],
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
        ref={svgRef}
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
        <circle className={styles.core} r={innerRadius - HUB_INSET} />
      </svg>

      {/*
       * The readout is HTML laid over the hub rather than <text> inside it.
       * SVG text is scaled by the viewBox, so at phone size a 12px caption
       * rendered at 6px; in HTML the sizes are real CSS pixels and hold at
       * every screen size.
       */}
      <div
        className={styles.hub}
        style={{ width: (innerRadius - HUB_INSET) * 2 * scale }}
        aria-live="polite"
      >
        {hoveredRing && hover ? (
          <>
            <span className={styles.hubValue}>{hoveredCount}</span>
            <span className={styles.hubLabel}>
              {hover.half === 'recurring' ? 'recurring' : 'tasks'}
            </span>
            <span className={cx(styles.hubLabel, styles.hubWhen)}>
              {hoveredRing.label.toLowerCase()}
            </span>
          </>
        ) : (
          <>
            <span className={styles.hubValue}>{todayRing?.count ?? 0}</span>
            <span className={styles.hubLabel}>due today</span>
            {overdueRing && (
              <span className={cx(styles.hubLabel, styles.hubOverdue)}>
                {overdueRing.count} overdue
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
