import { useCallback, useMemo, useState } from 'react'

export interface Selection {
  ids: ReadonlySet<string>
  has: (id: string) => boolean
  set: (id: string, selected: boolean) => void
  clear: () => void
  count: number
}

/**
 * Ticking a checkbox now selects rather than completes, so a slip of the mouse
 * costs nothing until "Mark as done" is pressed.
 */
export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set())

  const set = useCallback((id: string, selected: boolean) => {
    setIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setIds(new Set()), [])

  return useMemo(
    () => ({ ids, has: (id) => ids.has(id), set, clear, count: ids.size }),
    [ids, set, clear],
  )
}
