import { format, isSameDay, isValid, parseISO, startOfDay } from 'date-fns'
import { useRef, useState } from 'react'
import {
  DAY_MIN,
  atMinute,
  blockSpan,
  canPlaceOn,
  cardMinutes,
  defaultStartMin,
  formatDuration,
  formatMinute,
} from '../../domain/calendar'
import { formatDeadline, parseDayKey } from '../../domain/deadlines'
import { describeRecurrence } from '../../domain/recurrence'
import type { Block, Task } from '../../domain/types'
import { Modal, type ModalCloseRef } from '../ui/Modal'
import styles from './Calendar.module.css'

interface Props {
  task: Task
  /** The block being edited, or null to schedule the task for the first time. */
  block: Block | null
  /** Day the form opens on when there is no block yet. */
  day: Date
  now: Date
  blocks: Block[]
  onSave: (day: Date, startMin: number, endMin: number) => void
  onUnschedule: (() => void) | null
  onEditTask: () => void
  onClose: () => void
}

const LENGTHS = [15, 30, 45, 60, 90, 120]
const FORM_ID = 'block-editor-form'

/** "HH:mm" to minutes past midnight; NaN for an empty or partial field. */
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}

/**
 * The keyboard's way onto the calendar, and the precise one: a day and two
 * times. Everything a drag can do — place, move, stretch, take off — is here.
 */
export function BlockEditor({ task, block, day, now, blocks, onSave, onUnschedule, onEditTask, onClose }: Props) {
  const closeRef: ModalCloseRef = useRef<(() => void) | null>(null)
  const close = () => closeRef.current?.()

  const [initial] = useState(() => {
    if (block) return blockSpan(block)
    const length = cardMinutes(blocks, task.id)
    const startMin = defaultStartMin(day, now, length)
    return { day, startMin, endMin: startMin + length }
  })
  const [date, setDate] = useState(format(initial.day, 'yyyy-MM-dd'))
  const [from, setFrom] = useState(formatMinute(initial.startMin))
  const [to, setTo] = useState(formatMinute(initial.endMin))

  const d = parseDayKey(date)
  const startMin = toMin(from)
  // A time field cannot say 24:00; midnight as an end means the end of the day.
  const rawEnd = toMin(to)
  const endMin = rawEnd === 0 && startMin > 0 ? DAY_MIN : rawEnd
  const length = endMin - startMin

  const validDay = isValid(d)
  const past = validDay && d < startOfDay(now)
  const offDay = validDay && !canPlaceOn(task, d)
  const clash =
    validDay &&
    !!task.recurrence &&
    blocks.some((b) => b.taskId === task.id && b.id !== block?.id && isSameDay(parseISO(b.start), d))
  const ordered = Number.isFinite(length) && length > 0
  const canSave = validDay && !past && !offDay && !clash && ordered
  const deadline = parseISO(task.deadline)
  const afterDeadline = canSave && !task.recurrence && atMinute(d, endMin) > deadline

  // Moving the start carries the end with it, so the length is what stays put.
  const changeFrom = (v: string) => {
    setFrom(v)
    const next = toMin(v)
    if (ordered && Number.isFinite(next)) setTo(formatMinute(Math.min(next + length, DAY_MIN)))
  }

  const submit = () => {
    if (!canSave) return
    onSave(d, startMin, endMin)
    close()
  }

  return (
    <Modal
      title={task.title}
      subtitle={task.recurrence ? describeRecurrence(task.recurrence) : `Due ${formatDeadline(deadline, now)}`}
      onClose={onClose}
      closeRef={closeRef}
      width={460}
      footer={
        <>
          {onUnschedule && (
            <button
              type="button"
              className="btn btn-quiet btn-danger"
              onClick={() => {
                onUnschedule()
                close()
              }}
            >
              Unschedule
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              onEditTask()
              close()
            }}
          >
            Edit task
          </button>
          <span className={styles.spacer} />
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={!canSave}>
            {block ? 'Save' : 'Schedule'}
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className={styles.when}>
          <label className={styles.whenDay}>
            <span className="label">Day</span>
            <input
              type="date"
              className="input"
              value={date}
              min={format(now, 'yyyy-MM-dd')}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label>
            <span className="label">From</span>
            <input
              type="time"
              step={900}
              className="input"
              value={from}
              onChange={(e) => changeFrom(e.target.value)}
              required
            />
          </label>
          <label>
            <span className="label">To</span>
            <input type="time" step={900} className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
        </div>

        <div className="field">
          <span className="label">Length</span>
          <div className="segmented">
            {LENGTHS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={length === m}
                disabled={!Number.isFinite(startMin) || startMin + m > DAY_MIN}
                onClick={() => setTo(formatMinute(startMin + m))}
              >
                {formatDuration(m)}
              </button>
            ))}
          </div>
        </div>

        {(past || offDay || clash || !ordered || afterDeadline) && (
          <p className={afterDeadline && canSave ? styles.note : styles.noteBad} role="status">
            {past
              ? 'Pick today or a later day.'
              : offDay && task.recurrence
                ? `This repeats ${describeRecurrence(task.recurrence).toLowerCase()} — pick one of those days.`
                : clash
                  ? 'It is already on the calendar that day.'
                  : !ordered
                    ? 'It has to end after it starts.'
                    : `Ends after the deadline, ${formatDeadline(deadline, now)}.`}
          </p>
        )}
      </form>
    </Modal>
  )
}
