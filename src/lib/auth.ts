import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { db } from './db'
import { supabase } from './supabase'

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface Auth {
  status: AuthStatus
  email: string | null
  userId: string | null
}

function fromSession(session: Session | null): Auth {
  if (!session) return { status: 'signedOut', email: null, userId: null }
  return { status: 'signedIn', email: session.user.email ?? null, userId: session.user.id }
}

/** The local dev store has no accounts, so there is nothing to sign in to. */
const LOCAL_AUTH: Auth = { status: 'signedIn', email: null, userId: null }

/**
 * Keyed off the store actually in use rather than merely whether credentials
 * exist, so the `?local` dev override skips the sign-in wall too.
 */
const needsAuth = db.kind === 'supabase'

export function useAuth(): Auth {
  const queryClient = useQueryClient()
  const [auth, setAuth] = useState<Auth>(() =>
    needsAuth ? { status: 'loading', email: null, userId: null } : LOCAL_AUTH,
  )
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!needsAuth) return
    let active = true

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      lastUserId.current = data.session?.user.id ?? null
      setAuth(fromSession(data.session))
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null
      // Drop the cached board whenever the identity actually changes, so one
      // account's tasks can never flash up under another's. Token refreshes
      // keep the same id and are left alone.
      if (lastUserId.current !== nextId) queryClient.clear()
      lastUserId.current = nextId
      setAuth(fromSession(session))
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  return auth
}
