import { useRef, useState } from 'react'
import { TONES, type Tag, type Task, type Tone } from '../domain/types'
import { cx } from '../lib/cx'
import type { TagInput } from '../lib/db'
import styles from './LabelList.module.css'
import { Modal, type ModalCloseRef } from './ui/Modal'

interface Props {
  tags: Tag[]
  tasks: Task[]
  onCreate: (input: TagInput) => void
  onUpdate: (id: string, patch: Partial<TagInput>) => void
  onDelete: (id: string) => void
}

export function TagsView({ tags, tasks, onCreate, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Tag | 'new' | null>(null)

  const countFor = (tagId: string) => tasks.filter((t) => t.tagIds.includes(tagId)).length

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.heading}>Tags</h2>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          New tag
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="empty">
          No tags yet. Tags say what kind of work something is — health, financial, admin.
        </p>
      ) : (
        <div className={styles.rows}>
          {tags.map((tag) => (
            <button key={tag.id} type="button" className={styles.row} onClick={() => setEditing(tag)}>
              <span className="dot dot-hollow" style={{ color: `var(--tone-${tag.color})` }} />
              <span className={styles.body}>
                <span className={styles.name}>{tag.name}</span>
              </span>
              <span className={styles.meta}>
                <span className="tnum">{countFor(tag.id)} tasks</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <TagEditor
          tag={editing === 'new' ? null : editing}
          existing={tags}
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

const FORM_ID = 'tag-editor-form'

interface EditorProps {
  tag: Tag | null
  existing: Tag[]
  onSave: (input: TagInput) => void
  onDelete: (() => void) | null
  onClose: () => void
}

function TagEditor({ tag, existing, onSave, onDelete, onClose }: EditorProps) {
  const closeRef: ModalCloseRef = useRef<(() => void) | null>(null)
  const close = () => closeRef.current?.()

  const [name, setName] = useState(tag?.name ?? '')
  const [color, setColor] = useState<Tone>(tag?.color ?? 'sky')

  const trimmed = name.trim()
  // The database enforces one tag name per person; catching it here turns a
  // constraint violation into a hint before anything is sent.
  const duplicate = existing.some(
    (t) => t.id !== tag?.id && t.name.toLowerCase() === trimmed.toLowerCase(),
  )
  const canSave = trimmed.length > 0 && !duplicate

  return (
    <Modal
      title={tag ? 'Edit tag' : 'New tag'}
      onClose={onClose}
      closeRef={closeRef}
      width={420}
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
            {tag ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()
          if (!canSave) return
          onSave({ name: trimmed, color })
          close()
        }}
      >
        <div className="field">
          <label className="label" htmlFor="tag-name">
            Name
          </label>
          <input
            id="tag-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Health"
            autoFocus
          />
          {duplicate && <p className={styles.warn}>You already have a tag with that name.</p>}
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

        {onDelete && (
          <p className={styles.note}>
            Deleting a tag removes it from every task. The tasks themselves are untouched.
          </p>
        )}
      </form>
    </Modal>
  )
}
