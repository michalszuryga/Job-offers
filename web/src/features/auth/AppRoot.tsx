import type { Session } from '@supabase/auth-js'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { OffersPage } from '../offers/OffersPage'
import { AppShell } from '../../components/shell/AppShell'
import { BootSkeleton } from '../../components/shell/BootSkeleton'
import { DataSourceContext } from '../../lib/dataSource'
import { isMember, supabaseSource } from '../../lib/offers'
import { supabase } from '../../lib/supabase'
import type { SignInNotice } from './SignInCard'

// The app at '/' once there is a session to check (main.tsx routes there only with a stored
// session or a magic-link fragment): session, membership, then the offers. lib/supabase
// (imported here and through lib/offers) must only be reachable from this lazy chunk, never
// from the entry, the landing, the demo, Privacy or NotFound, so supabase-js stays out of
// them (check-bundle asserts it).

// The signed-out and no-access screens are their own chunks: a member's daily visit never
// needs them, and the list's first load stays inside its budget (check-bundle).
const Landing = lazy(() => import('../landing/Landing').then((m) => ({ default: m.Landing })))
const AccessGate = lazy(() => import('./AccessGate').then((m) => ({ default: m.AccessGate })))

type Notice = SignInNotice | null
type Access = 'checking' | 'member' | 'no-access' | 'error'

// At startup an expired link the user just opened says more than the stored session it
// failed to replace.
const expiredUnlessLink = (current: Notice): Notice => (current === 'linkExpired' ? current : 'sessionExpired')

// A stored session that can no longer be refreshed (expired or revoked) is reported as
// SIGNED_OUT once supabase-js finishes starting up, which can be before AppRoot's first
// effect subscribes. This listener exists from the moment the client does, so that one is
// never missed; AppRoot takes it with its INITIAL_SESSION. Nothing on screen yet could have
// asked for it, so it always means expired.
let expiredAtStartup = false
const startup = supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') expiredAtStartup = true
})

// `notice`: an expired-link fragment from this page load (main.tsx), shown if the stored
// session doesn't take over.
export function AppRoot({ notice: linkNotice = null }: { notice?: Notice }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [notice, setNotice] = useState<Notice>(linkNotice)
  // Set by this tab's Sign out, so its SIGNED_OUT isn't mistaken for an expired session.
  const signingOut = useRef(false)
  // Remembered per user and attempt, so switching accounts shows "checking" and a retry
  // really asks again.
  const [checked, setChecked] = useState<{ userId: string; attempt: number; access: Access } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let started = false
    // Fires once with the stored session (or null), then on every change. A SIGNED_OUT nobody
    // asked for here is a refresh that failed (expired or revoked) or another tab signing out.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        if (signingOut.current) setNotice(null)
        else setNotice(started ? 'sessionExpired' : expiredUnlessLink)
        signingOut.current = false
      }
      if (event === 'INITIAL_SESSION') {
        started = true
        if (expiredAtStartup && !next) setNotice(expiredUnlessLink)
        expiredAtStartup = false
        startup.data.subscription.unsubscribe()
      }
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    isMember(userId)
      .then((member) => setChecked({ userId, attempt, access: member ? 'member' : 'no-access' }))
      .catch(() => setChecked({ userId, attempt, access: 'error' }))
  }, [userId, attempt])
  const access: Access = checked && checked.userId === userId && checked.attempt === attempt ? checked.access : 'checking'
  // A retry keeps the error gate up, its Retry button busy and focused, until the answer.
  const retrying = access === 'checking' && checked != null && checked.userId === userId && checked.access === 'error'

  const signOut = useCallback(() => {
    signingOut.current = true
    supabase.auth.signOut().then(({ error }) => {
      // A failed server call still clears the local session (SIGNED_OUT has already reset
      // the flag), unless the session couldn't even be read, e.g. an expired token that
      // can't be refreshed offline: then nothing changed and no SIGNED_OUT follows.
      if (error) signingOut.current = false
    })
  }, [])
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (session === undefined) return <BootSkeleton />
  // Signed out here (Sign out, or an expired session): the landing, with its sign-in card.
  if (!session) {
    return (
      <Suspense fallback={<BootSkeleton />}>
        <Landing notice={notice} />
      </Suspense>
    )
  }
  if (access === 'checking' && !retrying) return <BootSkeleton />

  const email = session.user.email ?? ''
  if (access !== 'member') {
    return (
      <Suspense fallback={<BootSkeleton />}>
        <AccessGate
          kind={access === 'no-access' ? 'no-access' : 'error'}
          retrying={retrying}
          email={email}
          onRetry={retry}
          onSignOut={signOut}
        />
      </Suspense>
    )
  }
  return (
    <DataSourceContext value={supabaseSource}>
      <AppShell account={{ email, onSignOut: signOut }}>
        <OffersPage />
      </AppShell>
    </DataSourceContext>
  )
}
