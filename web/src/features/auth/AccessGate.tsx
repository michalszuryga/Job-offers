import { useEffect, useState } from 'react'
import { CirclePlay, Lock, LogOut, Mail, RotateCw } from 'lucide-react'
import { Link } from 'wouter'
import { Button, Callout, Icon, Logo } from '../../components/ui'
import { useI18n } from '../../i18n'
import { accessRequestHref } from './contact'
import './authScreen.css'
import './AccessGate.css'

interface Props {
  kind: 'no-access' | 'error'
  // A retry is under way: the gate stays, so Retry keeps focus and shows it is busy.
  retrying?: boolean
  email: string
  onRetry: () => void
  onSignOut: () => void
}

// Signed in, but not (or not yet known to be) in app_members (plan §4.3). Its own screen
// with its own Sign out, so it works without the app shell; the demo is one tap away.
export function AccessGate({ kind, retrying = false, email, onRetry, onSignOut }: Props) {
  const { t } = useI18n()
  const copy = t.accessGate
  // The error callout goes into the status region one frame after it is on screen: a region
  // inserted together with its text may go unannounced.
  const [announce, setAnnounce] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnnounce(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  const requestHref = accessRequestHref(copy.requestBody(email))

  return (
    <main className="auth-screen">
      <div className="auth-card gate">
        <header className="auth-card__header">
          <Logo />
          {kind === 'no-access' ? (
            <>
              <span className="gate__icon">
                <Icon icon={Lock} size={24} />
              </span>
              <h1 className="auth-card__title gate__title">{copy.noAccess}</h1>
              <p>
                {copy.privateBeta} {copy.exploreDemo}
              </p>
            </>
          ) : (
            <h1 className="visually-hidden">{copy.checkHeading}</h1>
          )}
          <p className="auth-card__lede gate__email">{copy.signedInAs(email)}</p>
        </header>

        <div role="status" className="auth-card__status">
          {kind === 'error' && announce && (
            <Callout
              tone="danger"
              title={copy.checkFailed}
              actions={
                <Button variant="secondary" size="sm" icon={RotateCw} loading={retrying} onClick={onRetry}>
                  {copy.retry}
                </Button>
              }
            />
          )}
        </div>

        <div className="auth-card__actions">
          {kind === 'no-access' && (
            <>
              {/* asChild: wouter's client-side navigation on the kit's link-styled Button. */}
              <Link href="/demo" asChild>
                <Button href="" icon={CirclePlay} fullWidth>
                  {copy.tryDemo}
                </Button>
              </Link>
              {requestHref && (
                <Button href={requestHref} variant="secondary" icon={Mail} fullWidth>
                  {copy.requestAccess}
                </Button>
              )}
            </>
          )}
          <Button variant={kind === 'no-access' ? 'ghost' : 'secondary'} icon={LogOut} fullWidth onClick={onSignOut}>
            {copy.signOut}
          </Button>
        </div>

        <Link href="/privacy" className="gate__privacy">
          {copy.privacy}
        </Link>
      </div>
    </main>
  )
}
