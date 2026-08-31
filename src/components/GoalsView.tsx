import { format, parseISO } from 'date-fns'
import { useRef, useState } from 'react'
import { TONES, type Goal, type Task, type Tone } from '../domain/types'
import { cx } from '../lib/cx'
import type { GoalInput } from '../lib/db'
import styles from './LabelList.module.css'
import { Modal, type ModalCloseRef } from './ui/Modal'

interface Props {
  goals: Goal[]
  tasks: Task[]
  onCreate: (input: GoalInput) => void
  onUpdate: (id: string, patch: Partial<GoalInput>) => void
  onDelete: (id: string) => void
}

export function GoalsView({ goals, tasks, onCreate, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)

  const countFor = (goalId: string) => tasks.filter((t) => t.goalIds.includes(goalId)).length

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Goals</h2>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          New goal
        </button>
      </div>

      {goals.length === 0 ? (
        <p className="empty">No goals yet. Goals tag tasks and drive the filters.</p>
      ) : (
        <div className={styles.rows}>
          {goals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={styles.row}
              onClick={() => setEditing(goal)}
            >
              <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
              <span className={styles.body}>
                <span className={styles.name}>{goal.name}</span>
                {goal.description && <span className={styles.desc}>{goal.description}</span>}
              </span>
              <span className={styles.meta}>
                {goal.deadline && (
                  <span className="tnum">{format(parseISO(goal.deadline), 'd MMM yyyy')}</span>
                )}
                <span className="tnum">{countFor(goal.id)} tasks</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <GoalEditor
          goal={editing === 'new' ? null : editing}
          onSave={(input) => {
            if (editing === 'new') onCreate(input)
            else onUpdate(editing.id, input)
          }}
          onDelete={editing === 'new' ? null : () => onDelete(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

const FORM_ID = 'goal-editor-form'

interface EditorProps {
  goal: Goal | null
  onSave: (input: GoalInput) => void
  onDelete: (() => void) | null
  onClose: () => void
}

function GoalEditor({ goal, onSave, onDelete, onClose }: EditorProps) {
  const closeRef: ModalCloseRef = useRef<(() => void) | null>(null)
  const close = () => closeRef.current?.()

  const [name, setName] = useState(goal?.name ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [deadline, setDeadline] = useState(
    goal?.deadline ? format(parseISO(goal.deadline), 'yyyy-MM-dd') : '',
  )
  const [color, setColor] = useState<Tone>(goal?.color ?? 'sky')

  const canSave = name.trim().length > 0

  return (
    <Modal
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      closeRef={closeRef}
      width={460}
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
              Delete
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={FORM_ID} className="btn btn-primary" disabled={!canSave}>
            {goal ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          onSave({
            name: name.trim(),
            description: description.trim() || null,
            // A date-only goal deadline is stored as that day's local midnight.
            deadline: deadline ? new Date(`${deadline}T00:00`).toISOString() : null,
            color,
          })
          close()
        }}
      >
        <div className="field">
          <label className="label" htmlFor="goal-name">
            Name
          </label>
          <input
            id="goal-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="goal-description">
            Description
          </label>
          <textarea
            id="goal-description"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="goal-deadline">
            Deadline
          </label>
          <input
            id="goal-deadline"
            type="date"
            className="input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>

        <div className="field">
          <span className="label">Colour</span>
          <div className={styles.swatches}>
            {TONES.map((c) => (
              <button
                key={c}
                type="button"
                className={cx(styles.swatch, color === c && styles.swatchOn)}
                style={{ background: `var(--tone-${c})` }}
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
