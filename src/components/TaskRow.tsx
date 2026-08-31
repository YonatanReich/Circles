import { formatDeadline } from '../domain/deadlines'
import { describeRecurrence } from '../domain/recurrence'
import type { RingTask } from '../domain/rings'
import type { Goal, Tag } from '../domain/types'
import { cx } from '../lib/cx'
import styles from './TaskRow.module.css'

interface Props {
  task: RingTask
  goals: Map<string, Goal>
  tags: Map<string, Tag>
  now: Date
  /** Filtered out, but still shown in place so the ring's contents stay stable. */
  dimmed?: boolean
  /** The checkbox selects; completing is a separate, deliberate action. */
  selected: boolean
  onSelect: (selected: boolean) => void
  onOpen: () => void
}

export function TaskRow({ task, goals, tags, now, dimmed, selected, onSelect, onOpen }: Props) {
  const taskGoals = task.goalIds.map((id) => goals.get(id)).filter((g): g is Goal => !!g)
  const taskTags = task.tagIds.map((id) => tags.get(id)).filter((t): t is Tag => !!t)
  const subtasksDone = task.subtasks.filter((s) => s.done).length

  return (
    <div
      className={cx(styles.row, dimmed && styles.dimmed, task.isCompleted && styles.completed)}
      data-importance={task.importance}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
        // Gold means recurring everywhere in the app, the checkbox included.
        data-recurring={task.isRecurring || undefined}
        aria-label={`Select ${task.title}`}
      />

      <button type="button" className={styles.main} onClick={onOpen}>
        <span className={styles.title}>{task.title}</span>

        <span className={styles.meta}>
          {task.isRecurring && task.recurrence && (
            <span className={styles.repeat}>
              <span className="dot" style={{ background: 'var(--gold)' }} />
              {describeRecurrence(task.recurrence)}
            </span>
          )}

          {/* Goals get a filled dot, tags a hollow one — same shape language,
              so the two axes stay distinguishable without a legend. */}
          {taskGoals.map((goal) => (
            <span key={goal.id} className={styles.label}>
              <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
              {goal.name}
            </span>
          ))}

          {taskTags.map((tag) => (
            <span key={tag.id} className={styles.label}>
              <span className="dot dot-hollow" style={{ color: `var(--tone-${tag.color})` }} />
              {tag.name}
            </span>
          ))}

          {task.subtasks.length > 0 && (
            <span className="tnum">
              {subtasksDone}/{task.subtasks.length}
            </span>
          )}
        </span>
      </button>

      <span className={cx(styles.due, 'tnum', task.isOverdue && styles.overdue)}>
        {formatDeadline(task.effectiveDeadline, now)}
      </span>
    </div>
  )
}
