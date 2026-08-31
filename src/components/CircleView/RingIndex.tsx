import type { Ring } from '../../domain/rings'
import { cx } from '../../lib/cx'
import { halfMatches, ringMatches, type Filters } from '../../lib/filters'
import styles from './RingIndex.module.css'
import type { Hover, RingHalf } from './types'

interface Props {
  rings: Ring[]
  filters: Filters
  now: Date
  hover: Hover | null
  onHover: (hover: Hover | null) => void
  onOpen: (ringKey: string, half: RingHalf) => void
}

/**
 * Names every ring in radial order.
 *
 * Labels drawn on the rings themselves collided as soon as two rings sat close
 * together, and a label lying across its own stroke was unreadable. A column
 * beside the canvas stays legible at any ring count, and doubles as the
 * keyboard route into a ring.
 */
export function RingIndex({ rings, filters, now, hover, onHover, onOpen }: Props) {
  return (
    <ol className={styles.index}>
      {rings.map((ring) => {
        const dimmed = !ringMatches(ring, filters, now)
        const recurring = ring.recurringTasks.length

        return (
          <li key={ring.key} className={cx(styles.item, dimmed && styles.dimmed)}>
            <button
              type="button"
              className={cx(
                styles.row,
                hover?.key === ring.key && hover.half === 'regular' && styles.active,
              )}
              disabled={ring.tasks.length === 0}
              onMouseEnter={() => onHover({ key: ring.key, half: 'regular' })}
              onFocus={() => onHover({ key: ring.key, half: 'regular' })}
              onClick={() => onOpen(ring.key, 'regular')}
            >
              <span className={styles.label}>{ring.label}</span>
              <span className={cx(styles.count, 'tnum')}>{ring.tasks.length || '—'}</span>
            </button>

            {recurring > 0 && (
              <button
                type="button"
                className={cx(
                  styles.gold,
                  hover?.key === ring.key && hover.half === 'recurring' && styles.active,
                  !halfMatches(ring, 'recurring', filters, now) && styles.dimmed,
                )}
                title={`${recurring} recurring`}
                onMouseEnter={() => onHover({ key: ring.key, half: 'recurring' })}
                onFocus={() => onHover({ key: ring.key, half: 'recurring' })}
                onClick={() => onOpen(ring.key, 'recurring')}
              >
                <span className="dot" style={{ background: 'var(--gold)' }} />
                <span className="tnum">{recurring}</span>
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
