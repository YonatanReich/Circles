import { addMinutes, format, parseISO } from 'date-fns'
import { useRef, useState } from 'react'
import type { Goal, Round, Tag } from '../../domain/types'
import { Modal, type ModalCloseRef } from '../ui/Modal'
import styles from './Focus.module.css'

interface Props {
  /**
   * `finished`: the timer just ended this round, ask what got done.
   * `edit`: an existing round from the tracker. `new`: logged after the fact.
   */
  mode: 'finished' | 'edit' | 'new'
  round: Round
  /** Goal and subject to start from when the round has none yet. */
  suggest?: Round
  goals: Goal[]
  tags: Tag[]
  onSave: (round: Round) => void
  onDelete?: () => void
  onClose: () => void
}

const FORM_ID = 'round-editor-form'

export function RoundEditor({ mode, round, suggest, goals, tags, onSave, onDelete, onClose }: Props) {
  const closeRef: ModalCloseRef = useRef<(() => void) | null>(null)
  const close = () => closeRef.current?.()

  const start = parseISO(round.startedAt)
  const blank = round.goalId === null && round.tagId === null && !round.notes
  const [goalId, setGoalId] = useState(blank ? (suggest?.goalId ?? null) : round.goalId)
  const [tagId, setTagId] = useState(blank ? (suggest?.tagId ?? null) : round.tagId)
  const [notes, setNotes] = useState(round.notes ?? '')
  const [day, setDay] = useState(format(start, 'yyyy-MM-dd'))
  const [time, setTime] = useState(format(start, 'HH:mm'))
  const [minutes, setMinutes] = useState(String(round.minutes))

  const mins = Number(minutes)
  const timed = mode !== 'finished'
  const valid = !timed || (Number.isInteger(mins) && mins >= 1 && mins <= 600 && !!day && !!time)

  const title = mode === 'finished' ? 'Round complete' : mode === 'new' ? 'Log a round' : 'Round'
  const subtitle =
    mode === 'finished'
      ? `${format(start, 'HH:mm')}–${format(addMinutes(start, round.minutes), 'HH:mm')} · ${round.minutes} min. What got done?`
      : mode === 'new'
        ? 'For focus time the timer did not see.'
        : format(start, 'EEEE d MMMM')

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeRef={closeRef}
      width={480}
      footer={
        <>
          {onDelete && (
            <button
              type="button"
              className="btn btn-quiet btn-danger"
              onClick={() => {
                onDelete()
                close()
              }}
            >
              {mode === 'finished' ? "Don't count it" : 'Delete'}
            </button>
          )}
          <span className={styles.grow} />
          <button type="button" className="btn" onClick={close}>
            {mode === 'finished' ? 'Skip' : 'Cancel'}
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={!valid}>
            {mode === 'new' ? 'Add round' : 'Save'}
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          onSave({
            ...round,
            startedAt: timed ? new Date(`${day}T${time}`).toISOString() : round.startedAt,
            minutes: timed ? mins : round.minutes,
            goalId,
            tagId,
            notes: notes.trim() || null,
          })
          close()
        }}
      >
        {timed && (
          <div className={styles.timing}>
            <div>
              <label className="label" htmlFor="round-day">
                Day
              </label>
              <input id="round-day" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="round-time">
                Started
              </label>
              <input id="round-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="round-minutes">
                Minutes
              </label>
              <input
                id="round-minutes"
                type="number"
                min={1}
                max={600}
                className="input tnum"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <span className="label">Goal</span>
          {goals.length === 0 ? (
            <p className={styles.hint}>No goals yet — add them in Tasks → Goals.</p>
          ) : (
            <div className={styles.chips}>
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="chip"
                  aria-pressed={goalId === g.id}
                  onClick={() => setGoalId(goalId === g.id ? null : g.id)}
                >
                  <span className="dot" style={{ background: `var(--tone-${g.color})` }} />
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">Subject</span>
          {tags.length === 0 ? (
            <p className={styles.hint}>Subjects are your tags — add them in Tasks → Tags.</p>
          ) : (
            <div className={styles.chips}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  aria-pressed={tagId === t.id}
                  onClick={() => setTagId(tagId === t.id ? null : t.id)}
                >
                  <span className="dot dot-hollow" style={{ color: `var(--tone-${t.color})` }} />
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="round-notes">
            What was done
          </label>
          <textarea
            id="round-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Finished chapter 4 exercises, started on templates…"
            autoFocus={mode === 'finished'}
          />
        </div>
      </form>
    </Modal>
  )
}
