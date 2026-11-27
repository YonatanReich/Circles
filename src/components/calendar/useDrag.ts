import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { clamp, DAY_MIN, type DragSource, type DropSpan } from '../../domain/calendar'

/** The pointer, in the calendar's terms. */
export interface PointerSlot {
  dayIndex: number
  /** Unsnapped minutes past midnight under the pointer. */
  minute: number
  /** Over the visible day columns — not the sticky header or gutter, not outside the grid. */
  inside: boolean
}

export interface DragTarget extends DropSpan {
  dayIndex: number
}

export interface ActiveDrag {
  /** Fresh per drag, to key the ghost: one still flying home must not be reused mid-transition. */
  id: number
  source: DragSource
  /** The grabbed element's box when the drag began, for sizing the ghost. */
  rect: DOMRect
}

interface Options {
  scrollerRef: RefObject<HTMLElement | null>
  colsRef: RefObject<HTMLElement | null>
  dayCount: number
  /** Sticky header height and gutter width inside the scroller, in px. */
  headPx: number
  gutterPx: number
  resolve: (source: DragSource, at: PointerSlot) => DragTarget | null
  onDrop: (source: DragSource, target: DragTarget) => void
}

/** A held finger becomes a drag after this long; moving first means it was a scroll. */
const LONG_PRESS_MS = 240
const MOUSE_SLOP_PX = 5
const TOUCH_SLOP_PX = 10
/** Auto-scroll band at the grid's edges, and its top speed in px per frame. */
const EDGE_PX = 48
const MAX_SCROLL_PX = 16

let dragSeq = 0

interface Session {
  source: DragSource
  el: HTMLElement
  pointerId: number
  touch: boolean
  x0: number
  y0: number
  x: number
  y: number
  rect: DOMRect
  dragging: boolean
  /** Auto-scroll waits until the pointer has been well inside the grid once. */
  armed: boolean
  target: DragTarget | null
  timer: number
  raf: number
  finish: (commit: boolean) => void
}

const sameTarget = (a: DragTarget | null, b: DragTarget | null) =>
  a === b ||
  (!!a && !!b && a.dayIndex === b.dayIndex && a.startMin === b.startMin && a.endMin === b.endMin && a.valid === b.valid)

const ghostTransform = (s: Session) =>
  `translate3d(${s.x - (s.x0 - s.rect.left)}px, ${s.y - (s.y0 - s.rect.top)}px, 0)`

/** The click a browser fires after the pointerup that ends a drag would open whatever was dragged. */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
  }
  addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => removeEventListener('click', stop, { capture: true }), 80)
}

/**
 * Pointer-driven drag and drop for the calendar: cards from the tray, blocks
 * between slots and days, and either edge of a block.
 *
 * Built on pointer events rather than HTML5 drag and drop, which has no touch
 * support and draws its own translucent snapshot that cannot be styled. Mouse
 * drags start after a few pixels of travel; touch drags after a short hold, so
 * a swipe still scrolls the tray or the grid. Only two things are React state —
 * what is being dragged and where it would land — and the second changes only
 * when the snapped slot does. The ghost under the pointer is moved by writing
 * its transform directly, so following the pointer never re-renders anything.
 */
export function useDrag(options: Options) {
  const [active, setActive] = useState<ActiveDrag | null>(null)
  const [target, setTarget] = useState<DragTarget | null>(null)
  const session = useRef<Session | null>(null)
  const ghost = useRef<HTMLElement | null>(null)
  const opts = useRef(options)
  opts.current = options

  useEffect(() => () => session.current?.finish(false), [])

  const ghostRef = useCallback((el: HTMLElement | null) => {
    ghost.current = el
    if (el && session.current) el.style.transform = ghostTransform(session.current)
  }, [])

  const start = useCallback((e: ReactPointerEvent<HTMLElement>, source: DragSource) => {
    if (session.current || e.button !== 0) return
    if ((e.target as Element).closest('input, [data-nodrag]')) return

    const el = e.currentTarget
    const s: Session = {
      source,
      el,
      pointerId: e.pointerId,
      touch: e.pointerType === 'touch',
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      rect: el.getBoundingClientRect(),
      dragging: false,
      armed: false,
      target: null,
      timer: 0,
      raf: 0,
      finish: () => {},
    }
    session.current = s

    const slotAt = (): PointerSlot | null => {
      const cols = opts.current.colsRef.current
      const scroller = opts.current.scrollerRef.current
      if (!cols || !scroller) return null
      const { dayCount, headPx, gutterPx } = opts.current
      const r = cols.getBoundingClientRect()
      const v = scroller.getBoundingClientRect()
      return {
        dayIndex: clamp(Math.floor(((s.x - r.left) / r.width) * dayCount), 0, dayCount - 1),
        minute: ((s.y - r.top) / r.height) * DAY_MIN,
        inside:
          s.x >= Math.max(r.left, v.left + gutterPx) &&
          s.x <= Math.min(r.right, v.right) &&
          s.y >= v.top + headPx &&
          s.y <= v.bottom,
      }
    }

    const update = () => {
      const g = ghost.current
      if (g) g.style.transform = ghostTransform(s)
      const at = slotAt()
      const t = at ? opts.current.resolve(source, at) : null
      if (!sameTarget(t, s.target)) {
        s.target = t
        setTarget(t)
      }
      if (g) g.dataset.over = t ? (t.valid ? 'valid' : 'invalid') : ''
    }

    const ramp = (depth: number) => Math.round(MAX_SCROLL_PX * Math.min(1, Math.max(0, depth) / EDGE_PX) ** 2)

    const autoScroll = () => {
      s.raf = requestAnimationFrame(autoScroll)
      const scroller = opts.current.scrollerRef.current
      if (!scroller) return
      const v = scroller.getBoundingClientRect()
      const top = v.top + opts.current.headPx
      const left = v.left + opts.current.gutterPx
      const overX = s.x > left && s.x < v.right
      const overY = s.y > top && s.y < v.bottom
      // A card rises into the grid through its bottom edge; that pass must not
      // scroll, so nothing does until the pointer has been well inside once.
      if (overX && s.y > top + EDGE_PX && s.y < v.bottom - EDGE_PX) s.armed = true
      if (!s.armed) return

      let dx = 0
      let dy = 0
      if (overX && s.y < top + EDGE_PX && s.y > top - 2 * EDGE_PX) dy = -ramp(top + EDGE_PX - s.y)
      else if (overX && s.y > v.bottom - EDGE_PX && s.y < v.bottom + EDGE_PX / 2) dy = ramp(s.y - (v.bottom - EDGE_PX))
      if (overY && s.x < left + EDGE_PX) dx = -ramp(left + EDGE_PX - s.x)
      else if (overY && s.x > v.right - EDGE_PX) dx = ramp(s.x - (v.right - EDGE_PX))
      if (!dx && !dy) return

      const { scrollTop, scrollLeft } = scroller
      scroller.scrollTop += dy
      scroller.scrollLeft += dx
      if (scroller.scrollTop !== scrollTop || scroller.scrollLeft !== scrollLeft) update()
    }

    const engage = () => {
      if (session.current !== s || s.dragging) return
      s.dragging = true
      clearTimeout(s.timer)
      if (s.touch) navigator.vibrate?.(8)
      else {
        try {
          el.setPointerCapture(s.pointerId)
        } catch {
          // Already released — the window listeners still see the pointer.
        }
      }
      document.documentElement.dataset.drag = source.kind === 'resize' ? 'resize' : 'move'
      setActive({ id: ++dragSeq, source, rect: s.rect })
      update()
      autoScroll()
    }

    /** A cancelled card glides back into its slot in the tray rather than vanishing. */
    const flyBack = () => {
      const g = ghost.current
      const clear = () => setActive((a) => (a?.source === source ? null : a))
      if (!g || source.kind !== 'card' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        clear()
        return
      }
      const home = el.isConnected ? el.getBoundingClientRect() : s.rect
      g.dataset.returning = ''
      g.style.transform = `translate3d(${home.left}px, ${home.top}px, 0)`
      const onEnd = (ev: TransitionEvent) => {
        if (ev.target === g && ev.propertyName === 'transform') clear()
      }
      g.addEventListener('transitionend', onEnd)
      setTimeout(clear, 600)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return
      s.x = ev.clientX
      s.y = ev.clientY
      if (s.dragging) {
        update()
        return
      }
      const moved = Math.hypot(s.x - s.x0, s.y - s.y0)
      if (s.touch) {
        if (moved > TOUCH_SLOP_PX) finish(false)
      } else if (source.kind === 'resize' || moved > MOUSE_SLOP_PX) engage()
    }
    const onUp = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(true)
    const onCancel = (ev: PointerEvent) => ev.pointerId === s.pointerId && finish(false)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && s.dragging) {
        ev.preventDefault()
        finish(false)
      }
    }
    // Once a touch drag is live the finger must not also scroll the page.
    const onTouchMove = (ev: TouchEvent) => s.dragging && ev.cancelable && ev.preventDefault()
    const onContextMenu = (ev: Event) => (s.touch || s.dragging) && ev.preventDefault()
    const onBlur = () => finish(false)

    const finish = (commit: boolean) => {
      if (session.current !== s) return
      session.current = null
      clearTimeout(s.timer)
      cancelAnimationFrame(s.raf)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
      removeEventListener('pointercancel', onCancel)
      removeEventListener('keydown', onKey)
      removeEventListener('touchmove', onTouchMove)
      removeEventListener('contextmenu', onContextMenu)
      removeEventListener('blur', onBlur)
      if (!s.dragging) return

      delete document.documentElement.dataset.drag
      swallowNextClick()
      const t = s.target
      setTarget(null)
      if (commit && t?.valid) {
        opts.current.onDrop(source, t)
        setActive(null)
      } else flyBack()
    }
    s.finish = finish

    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onCancel)
    addEventListener('keydown', onKey)
    addEventListener('touchmove', onTouchMove, { passive: false })
    addEventListener('contextmenu', onContextMenu)
    addEventListener('blur', onBlur)

    // An edge handle is unambiguous — nothing else happens on it — so a finger
    // takes it at once. Anywhere else a finger has to hold still first.
    if (s.touch) s.timer = window.setTimeout(engage, source.kind === 'resize' ? 0 : LONG_PRESS_MS)
  }, [])

  return { start, active, target, ghostRef }
}
