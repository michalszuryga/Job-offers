import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Login } from './components/Login'
import { OffersPage } from './components/OffersPage'
import { useI18n } from './i18n'
import { isMember } from './lib/offers'
import { supabase } from './lib/supabase'

type Access = 'checking' | 'member' | 'no-access' | 'error'

export default function App() {
  const { t } = useI18n()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Remembered per user, so switching accounts shows "checking" until the new answer arrives.
  const [checked, setChecked] = useState<{ userId: string; access: Access } | null>(null)

  useEffect(() => {
    // Fires once with the stored session (or null), then on every change.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    isMember(userId)
      .then((member) => setChecked({ userId, access: member ? 'member' : 'no-access' }))
      .catch(() => setChecked({ userId, access: 'error' }))
  }, [userId])
  const access: Access = checked && checked.userId === userId ? checked.access : 'checking'

  if (session === undefined) return <p className="center muted">{t.common.loading}</p>
  if (!session) return <Login />

  return (
    <div className="app">
      <header className="topbar">
        <h1>JOffers</h1>
        <div className="topbar-user">
          <span className="muted">{session.user.email}</span>
          <button className="link" onClick={() => supabase.auth.signOut()}>
            {t.app.signOut}
          </button>
        </div>
      </header>
      {access === 'checking' && <p className="center muted">{t.app.checkingAccess}</p>}
      {access === 'error' && <p className="center error">{t.app.accessError}</p>}
      {access === 'no-access' && <p className="center">{t.app.noAccess}</p>}
      {access === 'member' && <OffersPage />}
    </div>
  )
}
