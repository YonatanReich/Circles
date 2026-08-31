import { useState } from 'react'
import type { Ring } from '../../domain/rings'
import type { Filters } from '../../lib/filters'
import { CircleCanvas } from './CircleCanvas'
import styles from './CircleView.module.css'
import { RingIndex } from './RingIndex'
import type { Hover, RingHalf } from './types'

interface Props {
  rings: Ring[]
  filters: Filters
  now: Date
  onOpen: (ringKey: string, half: RingHalf) => void
}

/** Owns the hover, so pointing at a ring and pointing at its index row agree. */
export function CircleView({ rings, filters, now, onOpen }: Props) {
  const [hover, setHover] = useState<Hover | null>(null)

  return (
    <div className={styles.view}>
      <CircleCanvas
        rings={rings}
        filters={filters}
        now={now}
        hover={hover}
        onHover={setHover}
        onOpen={onOpen}
      />
      <div className={styles.aside} onMouseLeave={() => setHover(null)}>
        <RingIndex
          rings={rings}
          filters={filters}
          now={now}
          hover={hover}
          onHover={setHover}
          onOpen={onOpen}
        />
      </div>
    </div>
  )
}
