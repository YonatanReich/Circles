import { compareTasks } from '../domain/sort'
import type { Ring, RingTask } from '../domain/rings'
import type { Goal, Tag } from '../domain/types'
import { taskMatches, type Filters } from '../lib/filters'
import { useSelection } from '../lib/useSelection'
import { SelectionBar } from './SelectionBar'
import { TaskRow } from './TaskRow'
import styles from './ListView.module.css'

interface Props {
  rings: Ring[]
  completed: RingTask[]
  goals: Map<string, Goal>
  tags: Map<string, Tag>
  now: Date
  filters: Filters
  showCompleted: boolean
  onComplete: (tasks: RingTask[]) => void
  onRestore: (tasks: RingTask[]) => void
  onOpenTask: (task: RingTask) => void
}

export function ListView({
  rings,
  completed,
  goals,
  tags,
  now,
  filters,
  showCompleted,
  onComplete,
  onRestore,
  onOpenTask,
}: Props) {
  // Open and completed rows are selected independently: one leads to "Mark as
  // done", the other to "Restore", and a mixed selection would mean neither.
  const openSelection = useSelection()
  const doneSelection = useSelection()

  // A list is for finding things, so here a filter genuinely removes rows —
  // unlike the circles, where it only dims them.
  const sections = rings
    .map((ring) => ({
      ring,
      tasks: [...ring.tasks, ...ring.recurringTasks]
        .filter((t) => taskMatches(t, filters, now))
        .sort(compareTasks),
    }))
    .filter((s) => s.tasks.length > 0)

  const visibleCompleted = showCompleted
    ? completed.filter((t) => taskMatches(t, filters, now))
    : []

  const openTasks = sections.flatMap((s) => s.tasks)

  if (sections.length === 0 && visibleCompleted.length === 0) {
    return <p className="empty">No tasks match.</p>
  }

  return (
    <div className={styles.list}>
      {sections.map(({ ring, tasks }) => (
        <section key={ring.key} className={styles.section}>
          <header className={styles.head}>
            <h2 className={ring.isOverdue ? styles.headingLate : styles.heading}>{ring.label}</h2>
            <span className={`${styles.count} tnum`}>{tasks.length}</span>
          </header>
          <div className={styles.rows}>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                goals={goals}
                tags={tags}
                now={now}
                selected={openSelection.has(task.id)}
                onSelect={(on) => openSelection.set(task.id, on)}
                onOpen={() => onOpenTask(task)}
              />
            ))}
          </div>
        </section>
      ))}

      {visibleCompleted.length > 0 && (
        <section className={styles.section}>
          <header className={styles.head}>
            <h2 className={styles.heading}>Completed</h2>
            <span className={`${styles.count} tnum`}>{visibleCompleted.length}</span>
            {doneSelection.count > 0 && (
              <span className={styles.inlineBar}>
                <SelectionBar
                  count={doneSelection.count}
                  actionLabel="Restore"
                  onAction={() => {
                    onRestore(visibleCompleted.filter((t) => doneSelection.has(rowKey(t))))
                    doneSelection.clear()
                  }}
                  onClear={doneSelection.clear}
                />
              </span>
            )}
          </header>
          <div className={styles.rows}>
            {visibleCompleted.map((task) => (
              <TaskRow
                // A recurring task appears once per completed day, so the row
                // key has to include the occurrence.
                key={rowKey(task)}
                task={task}
                goals={goals}
                tags={tags}
                now={now}
                selected={doneSelection.has(rowKey(task))}
                onSelect={(on) => doneSelection.set(rowKey(task), on)}
                onOpen={() => onOpenTask(task)}
              />
            ))}
          </div>
        </section>
      )}

      {openSelection.count > 0 && (
        <div className={styles.dock}>
          <div className={styles.dockInner}>
            <SelectionBar
              count={openSelection.count}
              actionLabel="Mark as done"
              onAction={() => {
                onComplete(openTasks.filter((t) => openSelection.has(t.id)))
                openSelection.clear()
              }}
              onClear={openSelection.clear}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const rowKey = (task: RingTask) => (task.occurrenceDay ? `${task.id}@${task.occurrenceDay}` : task.id)
