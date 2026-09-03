import { useState } from 'react'
import { QUICK_PICKS } from '../domain/deadlines'
import { IMPORTANCE_LABEL, IMPORTANCE_LEVELS, type Goal, type Importance, type Tag } from '../domain/types'
import { cx } from '../lib/cx'
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
  /*
   * Laid out flat, the horizon buttons plus every goal and tag chip run to three
   * wrapped rows — over half a phone screen before any task is visible. Below
   * 640px they collapse behind this toggle, which carries the active count so
   * nothing is silently filtered. Above 640px the panel is `display: contents`
   * and the desktop bar is exactly as it was.
   */
  const [open, setOpen] = useState(false)

  const active =
    filters.goalIds.length +
    filters.tagIds.length +
    filters.importance.length +
    (filters.withinDays === null ? 0 : 1)

  const toggled = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  const toggleGoal = (id: string) => onChange({ ...filters, goalIds: toggled(filters.goalIds, id) })
  const toggleTag = (id: string) => onChange({ ...filters, tagIds: toggled(filters.tagIds, id) })
  const toggleImportance = (level: Importance) =>
    onChange({ ...filters, importance: toggled(filters.importance, level) })

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={cx('btn', styles.toggle)}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Filters{active > 0 && <span className={styles.badge}>{active}</span>}
      </button>

      <div className={cx(styles.panel, open && styles.panelOpen)}>
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

        {/* Importance is an OR like goals and tags: High + Urgent shows both. */}
        <div className={styles.goals}>
          {IMPORTANCE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={styles.goal}
              aria-pressed={filters.importance.includes(level)}
              onClick={() => toggleImportance(level)}
            >
              <span className={styles.pip} data-importance={level} />
              {IMPORTANCE_LABEL[level]}
            </button>
          ))}
        </div>

        {(goals.length > 0 || tags.length > 0) && <span className={styles.divider} />}

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
      </div>

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
