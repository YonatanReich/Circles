import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cx } from '../lib/cx'
import { signIn, signUp } from '../lib/supabase'
import styles from './AuthScreen.module.css'

type Mode = 'signin' | 'signup'

/** Supabase's own floor. Enforced here too, so the failure is inline not remote. */
const MIN_PASSWORD = 6

/*
 * The concentric field. The card is the innermost circle, so these start just
 * outside it and run well off the screen — the outermost is never seen whole,
 * which keeps the field ornament rather than a chart. Its diameter is `--card`
 * in the stylesheet; these track it.
 *
 * Sixteen of them, tightly spaced: the crest is made of discrete rings lighting
 * in turn, so the closer together they are the more it reads as one moving wave
 * instead of a row of blinks.
 */
const CARD_PX = 440
const RINGS = Array.from({ length: 16 }, (_, i) => Math.round(500 * 1.095 ** i))

/**
 * Pixels per millisecond the crest travels.
 *
 * The delay between two rings is their gap divided by this, rather than a fixed
 * step — the rings are spaced further apart as they go, so an even step made
 * the wave visibly accelerate outward. At constant speed it just travels.
 */
const SPEED = 2.2
const delayFor = (diameter: number) => Math.round((diameter - CARD_PX) / 2 / SPEED)

/** One ring's own flash. Matches @keyframes pulse: quick swell, long decay. */
const FLASH_MS = 500
/** How long the wave takes to leave the card and clear the outermost ring. */
const RIPPLE_MS = delayFor(RINGS[RINGS.length - 1]) + FLASH_MS
/** The idle heartbeat. Hovering the card can start one sooner. */
const PERIOD_MS = 10_000

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /*
   * The ripple is one CSS animation per ring, started by adding a class and
   * re-armed by removing it. The live timer doubles as the "already crossing"
   * guard: while it is set, both the heartbeat and a hover are ignored, so a
   * wave is never interrupted or stacked on top of itself.
   */
  const [rippling, setRippling] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const ripple = () => {
    if (timer.current) return
    setRippling(true)
    timer.current = setTimeout(() => {
      timer.current = undefined
      setRippling(false)
    }, RIPPLE_MS)
  }

  useEffect(() => {
    // One on arrival, so the screen shows what it does before the first wait.
    ripple()
    const id = setInterval(ripple, PERIOD_MS)
    return () => {
      clearInterval(id)
      clearTimeout(timer.current)
      // Cleared, so it must also be forgotten: a stale id left here reads as
      // "still crossing" and would wedge the guard shut for good — which is
      // exactly what StrictMode's double mount does in development.
      timer.current = undefined
    }
  }, [])

  const tooShort = mode === 'signup' && password.length > 0 && password.length < MIN_PASSWORD
  const canSubmit = email.trim().length > 0 && password.length >= MIN_PASSWORD && !busy

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      // On success the auth listener swaps this screen for the board; there is
      // nothing to do here.
      if (mode === 'signin') await signIn(email.trim(), password)
      else await signUp(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <div className={cx(styles.screen, rippling && styles.rippling)}>
      {/* Its own clipping layer: absolutely positioned, so rings far wider than
          the viewport are cut off without the page itself gaining a scrollbar
          or trapping the form on a short screen. */}
      <div className={styles.ripple} aria-hidden="true">
        {RINGS.map((size, i) => (
          <span
            key={size}
            className={styles.ring}
            style={{
              width: size,
              height: size,
              animationDelay: `${delayFor(size)}ms`,
              // A crest loses energy as it spreads. Applies at rest too, so the
              // outer hairlines sit further back even between waves.
              opacity: 1 - i * 0.045,
            }}
          />
        ))}
      </div>

      <div className={styles.stack}>
        {/* The stone: the innermost circle of the same system, and where the
            pulse starts before travelling outward. */}
        <div className={styles.card} onMouseEnter={ripple}>
          <div className={styles.inner}>
            <h1 className={styles.brand}>Circles</h1>
            <p className={styles.tagline}>Deadlines you can see the shape of.</p>

            <div className={cx('segmented', styles.modes)}>
              <button
                type="button"
                aria-pressed={mode === 'signin'}
                onClick={() => switchTo('signin')}
              >
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={mode === 'signup'}
                onClick={() => switchTo('signup')}
              >
                Create account
              </button>
            </div>

            <form onSubmit={submit}>
              {/* Disabled wholesale while a request is in flight, so the form
                  cannot be edited into disagreeing with what was sent. */}
              <fieldset className={styles.fields} disabled={busy}>
                <div className="field">
                  <label className="label" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="field">
                  <label className="label" htmlFor="auth-password">
                    Password
                  </label>
                  <div className={styles.control}>
                    <input
                      id="auth-password"
                      className={cx('input', styles.password)}
                      type={reveal ? 'text' : 'password'}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-describedby={mode === 'signup' ? 'auth-password-hint' : undefined}
                    />
                    <button
                      type="button"
                      className={styles.reveal}
                      aria-pressed={reveal}
                      aria-label={reveal ? 'Hide password' : 'Show password'}
                      onClick={() => setReveal((v) => !v)}
                    >
                      {reveal ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {/* Stated up front on sign-up rather than only once it is
                      violated — a rule you learn by failing is a bad rule. */}
                  {mode === 'signup' && (
                    <p
                      id="auth-password-hint"
                      className={cx(styles.hint, tooShort && styles.hintBad)}
                    >
                      At least {MIN_PASSWORD} characters.
                    </p>
                  )}
                </div>

                <button type="submit" className={cx('btn btn-primary', styles.submit)}>
                  {busy && <Spinner />}
                  {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </fieldset>
            </form>
          </div>
        </div>

        {/* Outside the disc: an error is variable height, and nothing that can
            grow is allowed to run into a circular edge. */}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

/** The button's own small ring, turning while the request is out. */
function Spinner() {
  return (
    <svg className={styles.spinner} viewBox="-12 -12 24 24" aria-hidden="true">
      <circle r={9} pathLength={100} strokeDasharray="26 100" />
    </svg>
  )
}
