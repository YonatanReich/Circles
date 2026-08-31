import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * The rendered pixel width of an element, tracked live.
 *
 * The ring canvas needs this because its viewBox is fixed: everything inside
 * scales with the rendered size, so anything that must stay a readable number
 * of real pixels has to be sized against the actual width rather than guessed
 * from a breakpoint.
 */
export function useElementWidth<T extends Element>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
