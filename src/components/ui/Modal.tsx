import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cx } from '../../lib/cx'
import styles from './Modal.module.css'

/** Handle a caller can use to close with the exit animation intact. */
export type ModalCloseRef = RefObject<(() => void) | null>

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
  /**
   * Populated with the animated close. Buttons rendered into `footer` or
   * `children` should call this rather than `onClose`, which unmounts at once
   * and cuts the transition off.
   */
  closeRef?: ModalCloseRef
}

/**
 * Built on the native <dialog>, which supplies the focus trap, the inert
 * background and Escape-to-close without a line of our own code.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 540,
  closeRef,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)

  // Held in a ref so the exit effect below never re-runs just because the
  // parent re-rendered with a fresh inline callback.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])

  /*
   * Closing is a two-step. The parent unmounts this component the moment
   * `onClose` fires, which would rip the element out of the DOM before any exit
   * transition could run. So a close request only sets `closing` — the CSS
   * fades things out — and the parent is told once that has finished.
   *
   * The delay is read back off the element rather than hardcoded, so it stays
   * in step with the `--dur` token and collapses to zero by itself under
   * `prefers-reduced-motion`.
   */
  useEffect(() => {
    if (!closing) return
    const el = ref.current
    if (!el) {
      onCloseRef.current()
      return
    }
    const seconds = parseFloat(getComputedStyle(el).transitionDuration) || 0
    const timer = setTimeout(() => onCloseRef.current(), seconds * 1000)
    return () => clearTimeout(timer)
  }, [closing])

  const requestClose = useCallback(() => setClosing(true), [])

  useEffect(() => {
    if (!closeRef) return
    closeRef.current = requestClose
    return () => {
      closeRef.current = null
    }
  }, [closeRef, requestClose])

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, closing && styles.closing)}
      style={{ width }}
      onCancel={(e) => {
        e.preventDefault()
        requestClose()
      }}
      // The dialog box has no padding, so it is only ever the event target when
      // the click landed on the backdrop.
      onClick={(e) => {
        if (e.target === ref.current) requestClose()
      }}
    >
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>{title}</h2>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
        <button type="button" className="btn btn-quiet" onClick={requestClose}>
          Close
        </button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.foot}>{footer}</footer>}
    </dialog>
  )
}
