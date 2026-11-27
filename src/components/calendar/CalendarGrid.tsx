import { format, isSameDay } from 'date-fns'
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import {
  DAY_MIN,
  clamp,
  formatDuration,
  formatMinute,
  layoutLanes,
  minuteOfDay,
  type Placed,
} from '../../domain/calendar'
import { dayKey } from '../../domain/deadlines'
import type { Block, Task } from '../../domain/types'
import { cx } from '../../lib/cx'
import styles from './Calendar.module.css'
import type { ActiveDrag, DragTarget } from './useDrag'

/** Pixel constants shared with the drag hit-testing; the CSS reads them as custom properties. */
export const HOUR_PX = 48
export const HEAD_PX = 64
export const GUTTER_PX = 52

/** A block resolved for drawing: which visible day it sits on, and its state. */
export interface GridBlock {
  block: Block
  task: Task
  dayIndex: number
  startMin: number
  endMin: number
  done: boolean
  /** A one-off scheduled to finish after its own deadline. */
  late: boolean
}

export type BlockGrab = 'move' | 'start' | 'end'

interface Props {
  days: Date[]
  now: Date
  blocks: GridBlock[]
  active: ActiveDrag | null
  target: DragTarget | null
  /** The block just placed, which lands without sliding. */
  settled: string | null
  scrollerRef: RefObject<HTMLDivElement | null>
  colsRef: RefObject<HTMLDivElement | null>
  onBlockDown: (e: PointerEvent<HTMLElement>, gb: GridBlock, grab: BlockGrab) => void
  onOpen: (gb: GridBlock) => void
  onToggle: (gb: GridBlock, done: boolean) => void
  /** An empty slot was clicked: start a new task there. */
  onSlot: (day: Date, startMin: number) => void
}

const HOURS = Array.from({ length: 23 }, (_, i) => i + 1)

/** Where a click on an empty column would put a new hour-long block. */
const slotStart = (e: { clientY: number; currentTarget: Element }) => {
  const min = ((e.clientY - e.currentTarget.getBoundingClientRect().top) / HOUR_PX) * 60
  return clamp(Math.floor(min / 30) * 30, 0, DAY_MIN - 60)
}

export function CalendarGrid({
  days,
  now,
  blocks,
  active,
  target,
  settled,
  scrollerRef,
  colsRef,
  onBlockDown,
  onOpen,
  onToggle,
  onSlot,
}: Props) {
  const nowMin = minuteOfDay(now)
  const showsToday = days.some((d) => isSameDay(d, now))

  // Open on the present: now sits a third of the way down the visible grid.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = Math.max(0, (nowMin / 60) * HOUR_PX - el.clientHeight / 3)
    // Only on mount — the grid is remounted per range, and must not jump each minute.
  }, [])

  const lanes = useMemo(
    () => days.map((_, i) => layoutLanes(blocks.filter((b) => b.dayIndex === i))),
    [blocks, days],
  )

  const src = active?.source
  const lifted = src?.kind === 'move' ? src.block.id : null
  const resizing = src?.kind === 'resize' ? src.block.id : null
  const preview = src && src.kind !== 'resize' ? target : null

  const planned = (i: number) =>
    blocks.filter((b) => b.dayIndex === i).reduce((sum, b) => sum + b.endMin - b.startMin, 0)

  return (
    <div ref={scrollerRef} className={styles.scroller}>
      <div
        className={styles.canvas}
        style={
          {
            '--days': days.length,
            '--hour': `${HOUR_PX}px`,
            '--head': `${HEAD_PX}px`,
            '--gutter': `${GUTTER_PX}px`,
          } as CSSProperties
        }
      >
        <div className={styles.corner} />

        <div className={styles.heads}>
          {days.map((day, i) => {
            const isToday = isSameDay(day, now)
            const mins = planned(i)
            return (
              <div key={dayKey(day)} className={cx(styles.head, isToday && styles.headToday)}>
                <span className={styles.weekday}>{format(day, 'EEE')}</span>
                <span className={cx(styles.dayNum, 'tnum')}>{format(day, 'd')}</span>
                <span className={cx(styles.planned, 'tnum')}>{mins ? formatDuration(mins) : ' '}</span>
              </div>
            )
          })}
        </div>

        <div className={styles.gutter} aria-hidden="true">
          {HOURS.map((h) => (
            <span
              key={h}
              className={cx(styles.hour, 'tnum')}
              // Stepped aside while the now chip sits on top of it.
              style={{ '--h': h, opacity: showsToday && Math.abs(h * 60 - nowMin) < 12 ? 0 : undefined } as CSSProperties}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
          {showsToday && (
            <span className={cx(styles.nowLabel, 'tnum')} style={{ '--now': nowMin } as CSSProperties}>
              {format(now, 'HH:mm')}
            </span>
          )}
        </div>

        <div ref={colsRef} className={styles.cols}>
          {days.map((day, i) => (
            <Column
              key={dayKey(day)}
              day={day}
              nowMin={isSameDay(day, now) ? nowMin : null}
              placed={lanes[i]}
              preview={preview?.dayIndex === i ? preview : null}
              previewTitle={src?.task.title ?? ''}
              lifted={lifted}
              resizing={resizing}
              live={resizing ? target : null}
              settled={settled}
              onBlockDown={onBlockDown}
              onOpen={onOpen}
              onToggle={onToggle}
              onSlot={onSlot}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface ColumnProps {
  day: Date
  /** Minutes past midnight now, when this column is today. */
  nowMin: number | null
  placed: Placed<GridBlock>[]
  preview: DragTarget | null
  previewTitle: string
  lifted: string | null
  resizing: string | null
  live: DragTarget | null
  settled: string | null
  onBlockDown: Props['onBlockDown']
  onOpen: Props['onOpen']
  onToggle: Props['onToggle']
  onSlot: Props['onSlot']
}

function Column({
  day,
  nowMin,
  placed,
  preview,
  previewTitle,
  lifted,
  resizing,
  live,
  settled,
  onBlockDown,
  onOpen,
  onToggle,
  onSlot,
}: ColumnProps) {
  // The "+ 14:30" hint that follows the mouse is positioned by hand: it moves
  // on every mousemove and has no business re-rendering the column.
  const hint = useRef<HTMLDivElement>(null)

  return (
    <div
      className={cx(styles.col, nowMin !== null && styles.colToday)}
      onMouseMove={(e) => {
        const el = hint.current
        if (!el || e.target !== e.currentTarget) return
        const min = slotStart(e)
        el.style.transform = `translateY(${(min / 60) * HOUR_PX}px)`
        el.dataset.label = `+ ${formatMinute(min)}`
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSlot(day, slotStart(e))
      }}
    >
      {nowMin !== null && <div className={styles.past} style={{ '--now': nowMin } as CSSProperties} />}
      <div ref={hint} className={styles.slotHint} aria-hidden="true" />

      {placed.map(({ item, col, cols }) => {
        const span = item.block.id === resizing && live ? live : item
        return (
          <BlockView
            key={item.block.id}
            gb={item}
            startMin={span.startMin}
            endMin={span.endMin}
            col={col}
            cols={cols}
            lifted={item.block.id === lifted}
            resizing={item.block.id === resizing}
            settled={item.block.id === settled}
            onBlockDown={onBlockDown}
            onOpen={onOpen}
            onToggle={onToggle}
          />
        )
      })}

      {preview && (
        <div
          className={cx(
            styles.block,
            styles.preview,
            preview.endMin - preview.startMin <= 30 && styles.short,
            !preview.valid && styles.invalid,
          )}
          style={{ '--s': preview.startMin, '--e': preview.endMin, '--col': 0, '--cols': 1 } as CSSProperties}
          aria-hidden="true"
        >
          <span className={styles.blockBody}>
            <span className={styles.blockTitle}>{preview.valid ? previewTitle : 'Not on this day'}</span>
            <span className={cx(styles.blockTime, 'tnum')}>
              {formatMinute(preview.startMin)} – {formatMinute(preview.endMin)}
            </span>
          </span>
        </div>
      )}

      {nowMin !== null && <div className={styles.nowLine} style={{ '--now': nowMin } as CSSProperties} />}
    </div>
  )
}

interface BlockProps {
  gb: GridBlock
  startMin: number
  endMin: number
  col: number
  cols: number
  lifted: boolean
  resizing: boolean
  settled: boolean
  onBlockDown: Props['onBlockDown']
  onOpen: Props['onOpen']
  onToggle: Props['onToggle']
}

function BlockView({
  gb,
  startMin,
  endMin,
  col,
  cols,
  lifted,
  resizing,
  settled,
  onBlockDown,
  onOpen,
  onToggle,
}: BlockProps) {
  const { task } = gb
  const length = endMin - startMin
  const time = `${formatMinute(startMin)} – ${formatMinute(endMin)}`

  return (
    <div
      className={cx(
        styles.block,
        length <= 30 && styles.short,
        gb.done && styles.done,
        lifted && styles.lifted,
        resizing && styles.resizing,
        settled && styles.settle,
      )}
      data-importance={task.importance}
      data-recurring={task.recurrence ? '' : undefined}
      style={{ '--s': startMin, '--e': endMin, '--col': col, '--cols': cols } as CSSProperties}
      onPointerDown={(e) => onBlockDown(e, gb, 'move')}
    >
      <span
        className={cx(styles.handle, styles.handleTop)}
        onPointerDown={(e) => {
          e.stopPropagation()
          onBlockDown(e, gb, 'start')
        }}
      />
      <input
        type="checkbox"
        className={styles.blockCheck}
        checked={gb.done}
        data-recurring={task.recurrence ? '' : undefined}
        onChange={(e) => onToggle(gb, e.target.checked)}
        aria-label={`${gb.done ? 'Reopen' : 'Complete'} ${task.title}`}
      />
      <button
        type="button"
        className={styles.blockBody}
        onClick={() => onOpen(gb)}
        aria-label={`${task.title}, ${time}. Edit time`}
        // A narrow lane cuts the title short; the whole of it is a hover away.
        title={`${task.title}
${time}`}
      >
        <span className={styles.blockTitle}>{task.title}</span>
        <span
          className={cx(styles.blockTime, 'tnum', gb.late && styles.late)}
          title={gb.late ? 'Ends after its deadline' : undefined}
        >
          {time}
        </span>
      </button>
      <span
        className={cx(styles.handle, styles.handleBottom)}
        onPointerDown={(e) => {
          e.stopPropagation()
          onBlockDown(e, gb, 'end')
        }}
      />
    </div>
  )
}
