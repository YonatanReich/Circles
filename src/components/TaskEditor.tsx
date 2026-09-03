import { parseISO } from 'date-fns'
import { useRef, useState } from 'react'
import {
  QUICK_PICKS,
  combineDayAndTime,
  resolveQuickPick,
  toDateTimeLocal,
  type QuickPick,
} from '../domain/deadlines'
import { WEEKDAY_LABELS } from '../domain/recurrence'
import type { RingTask } from '../domain/rings'
import { outcomeOf } from '../domain/stats'
import {
  IMPORTANCE_LABEL,
  IMPORTANCE_LEVELS,
  type Goal,
  type Importance,
  type Recurrence,
  type Tag,
} from '../domain/types'
import { cx } from '../lib/cx'
import type { TaskInput } from '../lib/db'
import styles from './TaskEditor.module.css'
import { Modal, type ModalCloseRef } from './ui/Modal'

type DeadlineMode = QuickPick | 'custom'
type RepeatMode = 'none' | Recurrence['freq']

interface Props {
  /** null creates a new task. */
  task: RingTask | null
  goals: Goal[]
  tags: Tag[]
  now: Date
  onSave: (input: TaskInput) => void
  onDelete: (() => void) | null
  onClose: () => void
  onAddSubtask: (taskId: string, title: string) => void
  onToggleSubtask: (id: string, done: boolean) => void
  onDeleteSubtask: (id: string) => void
  /** Any reason already logged against the occurrence currently on show. */
  occurrenceReason: string | null
  /** Records why one dated instance of a recurring task was missed. */
  onOccurrenceReason: (taskId: string, day: string, reason: string | null) => void
}

/** An existing deadline shows as a quick-pick only if it matches one exactly. */
function initialMode(task: RingTask | null, now: Date): DeadlineMode {
  if (!task) return 'today'
  const ms = parseISO(task.deadline).getTime()
  return QUICK_PICKS.find((p) => resolveQuickPick(p.id, now).getTime() === ms)?.id ?? 'custom'
}

const FORM_ID = 'task-editor-form'

export function TaskEditor({
  task,
  goals,
  tags,
  now,
  onSave,
  onDelete,
  onClose,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  occurrenceReason,
  onOccurrenceReason,
}: Props) {
  const rec = task?.recurrence ?? null
  // Saving and cancelling close through the Modal so the exit animation runs;
  // going straight to `onClose` would unmount before the first frame.
  const closeRef: ModalCloseRef = useRef<(() => void) | null>(null)
  const close = () => closeRef.current?.()

  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [mode, setMode] = useState<DeadlineMode>(() => initialMode(task, now))
  const [custom, setCustom] = useState(() =>
    toDateTimeLocal(task ? parseISO(task.deadline) : resolveQuickPick('today', now)),
  )
  const [importance, setImportance] = useState<Importance>(task?.importance ?? 0)
  const [goalIds, setGoalIds] = useState<string[]>(task?.goalIds ?? [])
  const [tagIds, setTagIds] = useState<string[]>(task?.tagIds ?? [])

  const [repeat, setRepeat] = useState<RepeatMode>(rec?.freq ?? 'none')
  const [weekdays, setWeekdays] = useState<number[]>(
    rec?.freq === 'weekly' ? rec.weekdays : [new Date(now).getDay()],
  )
  const [monthDay, setMonthDay] = useState(rec?.freq === 'monthly' ? rec.day : now.getDate())
  const [time, setTime] = useState(rec?.time ?? '23:59')

  const [pending, setPending] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  /*
   * A missed deadline is derived, not stored — the task is simply past its
   * deadline and not done — so this field appears and disappears on its own as
   * the deadline moves. The reason itself is kept once written, including after
   * a late completion, because it explains something that really happened.
   */
  // A recurring task's `deadline` is its first occurrence ever, so the resolved
  // `isOverdue` — which looks at the instance on show — is the right question.
  const missed = !task ? false : task.recurrence ? task.isOverdue : outcomeOf(task, now) === 'missed'
  const missedDay = task?.occurrenceDay ?? null
  const storedReason = (missedDay ? occurrenceReason : task?.failureReason) ?? ''
  const [failureReason, setFailureReason] = useState(storedReason)
  const askWhy = !!task && (missed || storedReason !== '')

  const toggleId = (setIds: typeof setGoalIds) => (id: string) =>
    setIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const toggleGoal = toggleId(setGoalIds)
  const toggleTag = toggleId(setTagIds)

  const toggleWeekday = (d: number) =>
    setWeekdays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]))

  const recurrence: Recurrence | null =
    repeat === 'none'
      ? null
      : repeat === 'daily'
        ? { freq: 'daily', time }
        : repeat === 'weekly'
          ? { freq: 'weekly', weekdays, time }
          : { freq: 'monthly', day: monthDay, time }

  const base = mode === 'custom' ? new Date(custom) : resolveQuickPick(mode, now)
  const validDate = !Number.isNaN(base.getTime())
  const canSave =
    title.trim().length > 0 && validDate && !(repeat === 'weekly' && weekdays.length === 0)

  const addPending = () => {
    const value = draft.trim()
    if (!value) return
    if (task) onAddSubtask(task.id, value)
    else setPending((list) => [...list, value])
    setDraft('')
  }

  const submit = () => {
    if (!canSave) return
    // With a repeat rule the picker chooses the first occurrence's day and the
    // rule's own time supplies the hour.
    const deadline = recurrence ? combineDayAndTime(base, time) : base
    // A recurring miss belongs to its day, not to the rule, so it goes to the
    // occurrence log instead of riding along on the task.
    if (askWhy && failureReason !== storedReason && missedDay && task) {
      onOccurrenceReason(task.id, missedDay, failureReason.trim() || null)
    }
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      deadline: deadline.toISOString(),
      importance,
      recurrence,
      goalIds,
      tagIds,
      ...(askWhy && !missedDay ? { failureReason: failureReason.trim() || null } : {}),
      ...(task ? {} : { subtaskTitles: pending }),
    })
    close()
  }

  return (
    <Modal
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      closeRef={closeRef}
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
            {task ? 'Save' : 'Create'}
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
        <div className="field">
          <label className="label" htmlFor="task-title">
            Title
          </label>
          <input
            id="task-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="task-description">
            Description
          </label>
          <textarea
            id="task-description"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>

        {askWhy && (
          <div className={cx('field', styles.missed)}>
            <label className="label" htmlFor="task-failure">
              {missed ? 'Missed — what got in the way?' : 'What got in the way'}
            </label>
            <textarea
              id="task-failure"
              className="textarea"
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              placeholder="Optional. Kept so the analysis panel can look for a pattern."
            />
          </div>
        )}

        <div className="field">
          <span className="label">{recurrence ? 'First occurrence' : 'Deadline'}</span>
          <div className={styles.row}>
            <div className="segmented">
              {QUICK_PICKS.map((pick) => (
                <button
                  key={pick.id}
                  type="button"
                  aria-pressed={mode === pick.id}
                  onClick={() => setMode(pick.id)}
                >
                  {pick.label}
                </button>
              ))}
              <button type="button" aria-pressed={mode === 'custom'} onClick={() => setMode('custom')}>
                Custom
              </button>
            </div>
          </div>
          {mode === 'custom' && (
            <input
              type="datetime-local"
              className={cx('input', styles.inline)}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>

        <div className="field">
          <span className="label">Importance</span>
          <div className="segmented">
            {IMPORTANCE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={importance === level}
                onClick={() => setImportance(level)}
              >
                {IMPORTANCE_LABEL[level]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Repeat</span>
          <div className="segmented">
            {(['none', 'daily', 'weekly', 'monthly'] as RepeatMode[]).map((r) => (
              <button key={r} type="button" aria-pressed={repeat === r} onClick={() => setRepeat(r)}>
                {r === 'none' ? 'None' : r[0].toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>

          {repeat !== 'none' && (
            <div className={styles.repeatBody}>
              {repeat === 'weekly' && (
                <div className="segmented">
                  {WEEKDAY_LABELS.map((label, d) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={weekdays.includes(d)}
                      onClick={() => toggleWeekday(d)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {repeat === 'monthly' && (
                <label className={styles.smallField}>
                  <span className={styles.smallLabel}>Day</span>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={cx('input', styles.narrow)}
                    value={monthDay}
                    onChange={(e) => setMonthDay(Number(e.target.value))}
                  />
                </label>
              )}

              <label className={styles.smallField}>
                <span className={styles.smallLabel}>Until</span>
                <input
                  type="time"
                  className={cx('input', styles.narrow)}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
            </div>
          )}

          {repeat === 'monthly' && monthDay > 28 && (
            <p className={styles.note}>Short months fall back to their last day.</p>
          )}
          {repeat === 'weekly' && weekdays.length === 0 && (
            <p className={styles.note}>Pick at least one day.</p>
          )}
        </div>

        {goals.length > 0 && (
          <div className="field">
            <span className="label">Goals</span>
            <div className={styles.goals}>
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  className={styles.goal}
                  aria-pressed={goalIds.includes(goal.id)}
                  onClick={() => toggleGoal(goal.id)}
                >
                  <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
                  {goal.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {tags.length > 0 && (
          <div className="field">
            <span className="label">Tags</span>
            <div className={styles.goals}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={styles.goal}
                  aria-pressed={tagIds.includes(tag.id)}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="dot dot-hollow" style={{ color: `var(--tone-${tag.color})` }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="label">Subtasks</span>

          {task
            ? task.subtasks.map((sub) => (
                <div key={sub.id} className={styles.subtask}>
                  <input
                    type="checkbox"
                    checked={sub.done}
                    onChange={(e) => onToggleSubtask(sub.id, e.target.checked)}
                  />
                  <span className={cx(styles.subTitle, sub.done && styles.subDone)}>{sub.title}</span>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => onDeleteSubtask(sub.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            : pending.map((value, i) => (
                <div key={`${value}-${i}`} className={styles.subtask}>
                  <input type="checkbox" className={styles.subCheck} disabled />
                  <span className={styles.subTitle}>{value}</span>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setPending((list) => list.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}

          <input
            className={cx('input', styles.inline)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            // Enter adds a subtask here rather than submitting the outer form,
            // which is what a checklist input is expected to do.
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addPending()
              }
            }}
            placeholder="Add a subtask, then press Enter"
          />
        </div>
      </form>
    </Modal>
  )
}
