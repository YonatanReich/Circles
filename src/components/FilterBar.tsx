import { QUICK_PICKS } from '../domain/deadlines'
import type { Goal, Tag } from '../domain/types'
import { isFiltering, NO_FILTERS, type Filters } from '../lib/filters'
import styles from './FilterBar.module.css'

interface Props {
  goals: Goal[]
  tags: Tag[]
  filters: Filters
  onChange: (filters: Filters) => void
  showCompleted: boolean
  onShowCompleted: (value: boolean) => void
  showCompletedToggle: boolean
}

export function FilterBar({
  goals,
  tags,
  filters,
  onChange,
  showCompleted,
  onShowCompleted,
  showCompletedToggle,
}: Props) {
  const toggle = (key: 'goalIds' | 'tagIds') => (id: string) =>
    onChange({
      ...filters,
      [key]: filters[key].includes(id)
        ? filters[key].filter((x) => x !== id)
        : [...filters[key], id],
    })

  const toggleGoal = toggle('goalIds')
  const toggleTag = toggle('tagIds')

  return (
    <div className={styles.bar}>
      <div className="segmented">
        <button
          type="button"
          aria-pressed={filters.withinDays === null}
          onClick={() => onChange({ ...filters, withinDays: null })}
        >
          Any time
        </button>
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick.id}
            type="button"
            aria-pressed={filters.withinDays === pick.days}
            onClick={() => onChange({ ...filters, withinDays: pick.days })}
          >
            {pick.label}
          </button>
        ))}
      </div>

      {goals.length > 0 && (
        <div className={styles.goals}>
          {goals.map((goal) => (
            <button
              key={goal.id}
              type="button"
              className={styles.goal}
              aria-pressed={filters.goalIds.includes(goal.id)}
              onClick={() => toggleGoal(goal.id)}
            >
              <span className="dot" style={{ background: `var(--tone-${goal.color})` }} />
              {goal.name}
            </button>
          ))}
        </div>
      )}

      {goals.length > 0 && tags.length > 0 && <span className={styles.divider} />}

      {tags.length > 0 && (
        <div className={styles.goals}>
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={styles.goal}
              aria-pressed={filters.tagIds.includes(tag.id)}
              onClick={() => toggleTag(tag.id)}
            >
              <span className="dot dot-hollow" style={{ color: `var(--tone-${tag.color})` }} />
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <span className={styles.spacer} />

      {showCompletedToggle && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => onShowCompleted(e.target.checked)}
          />
          Completed
        </label>
      )}

      {isFiltering(filters) && (
        <button type="button" className="btn btn-quiet" onClick={() => onChange(NO_FILTERS)}>
          Clear
        </button>
      )}
    </div>
  )
}
