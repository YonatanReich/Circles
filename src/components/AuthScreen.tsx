import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '../lib/supabase'
import styles from './AuthScreen.module.css'

type Mode = 'signin' | 'signup'

/** Supabase's own floor. Enforced here too, so the failure is inline not remote. */
const MIN_PASSWORD = 6

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={submit}>
        <span className={styles.brand}>Circles</span>

        <div className={`segmented ${styles.modes}`}>
          <button type="button" aria-pressed={mode === 'signin'} onClick={() => switchTo('signin')}>
            Sign in
          </button>
          <button type="button" aria-pressed={mode === 'signup'} onClick={() => switchTo('signup')}>
            Create account
          </button>
        </div>

        <div className="field">
          <label className="label" htmlFor="auth-email">
            Email
          </label>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {tooShort && (
            <p className={styles.hint}>At least {MIN_PASSWORD} characters.</p>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={`btn btn-primary ${styles.submit}`} disabled={!canSubmit}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
