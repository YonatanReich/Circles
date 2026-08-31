import type { Ring, RingTask } from '../domain/rings'
import type { Goal, Tag } from '../domain/types'
import { taskMatches, type Filters } from '../lib/filters'
import { useSelection } from '../lib/useSelection'
import type { RingHalf } from './CircleView/types'
import { SelectionBar } from './SelectionBar'
import { TaskRow } from './TaskRow'
import { Modal } from './ui/Modal'

interface Props {
  ring: Ring
  half: RingHalf
  goals: Map<string, Goal>
  tags: Map<string, Tag>
  now: Date
  filters: Filters
  onClose: () => void
  onComplete: (tasks: RingTask[]) => void
  onOpenTask: (task: RingTask) => void
}

export function RingModal({
  ring,
  half,
  goals,
  tags,
  now,
  filters,
  onClose,
  onComplete,
  onOpenTask,
}: Props) {
  const tasks = half === 'recurring' ? ring.recurringTasks : ring.tasks
  const kind = half === 'recurring' ? 'recurring' : 'one-off'
  const selection = useSelection()

  const markDone = () => {
    onComplete(tasks.filter((t) => selection.has(t.id)))
    selection.clear()
  }

  return (
    <Modal
      title={ring.label}
      subtitle={`${tasks.length} ${kind} ${tasks.length === 1 ? 'task' : 'tasks'}`}
      onClose={onClose}
      // The footer only exists while something is ticked, so the modal stays
      // quiet until there is actually an action to take.
      footer={
        selection.count > 0 ? (
          <SelectionBar
            count={selection.count}
            actionLabel="Mark as done"
            onAction={markDone}
            onClear={selection.clear}
          />
        ) : undefined
      }
    >
      {tasks.length === 0 ? (
        <p className="empty">Nothing here.</p>
      ) : (
        tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            goals={goals}
            tags={tags}
            now={now}
            // Filtered-out tasks stay in place, dimmed, so the ring's real
            // contents are never hidden by a filter.
            dimmed={!taskMatches(task, filters, now)}
            selected={selection.has(task.id)}
            onSelect={(on) => selection.set(task.id, on)}
            onOpen={() => onOpenTask(task)}
          />
        ))
      )}
    </Modal>
  )
}
