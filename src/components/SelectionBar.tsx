import styles from './SelectionBar.module.css'

interface Props {
  count: number
  actionLabel: string
  onAction: () => void
  onClear: () => void
}

export function SelectionBar({ count, actionLabel, onAction, onClear }: Props) {
  if (count === 0) return null

  return (
    <div className={styles.bar}>
      <span className={`${styles.count} tnum`}>{count} selected</span>
      <button type="button" className="btn btn-quiet" onClick={onClear}>
        Clear
      </button>
      <button type="button" className="btn btn-primary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}
