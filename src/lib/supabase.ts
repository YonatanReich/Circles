import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Constructed even when unconfigured — createClient does no I/O, and the
 * placeholder keeps the module importable so the app can fall back to the
 * local dev store instead of crashing at load.
 */
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

/** Supabase's wire messages are terse; these are the ones users actually hit. */
function readable(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'That email and password do not match an account.'
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with that email already exists — sign in instead.'
  }
  if (m.includes('email logins are disabled')) {
    return 'Email sign-in is switched off for this project. Enable the Email provider in Supabase → Authentication → Sign In / Providers.'
  }
  return message
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(readable(error.message))
}

export async function signUp(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(readable(error.message))

  // With "Confirm email" left on, Supabase creates the user but withholds the
  // session until the link is clicked. Nothing can proceed, so say why.
  if (!data.session) {
    throw new Error(
      'Account created — check your inbox to confirm the address, then sign in. ' +
        'To skip this step, turn off "Confirm email" in Supabase → Authentication → Sign In / Providers → Email.',
    )
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}
