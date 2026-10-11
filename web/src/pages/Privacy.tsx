import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, LogOut } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { Button, Callout, Icon, Logo } from '../components/ui'
import { CONTACT_EMAIL, CONTROLLER_NAME } from '../features/auth/contact'
import { useI18n } from '../i18n'
import './Privacy.css'

// Plan §4.11. Reached at ./privacy; linked from the landing footer and the account menu in P8.
// No supabase-js here: Sign out loads it on click.

// Bump with any change to what the page says.
const UPDATED = '2026-10-11'
const AUTH_KEY = 'joffers-auth'
const PUODO_URL = 'https://uodo.gov.pl/'

// Signed in on this device = supabase-js has a stored session. Storage can throw (blocked).
function hasSession(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) != null
  } catch {
    return false
  }
}

// Another tab signing in or out changes the answer.
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

function Mailto() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
}

export function Privacy() {
  const { t, lang } = useI18n()
  const copy = t.privacy
  const [, navigate] = useLocation()
  // Server snapshot false: P8 prerenders this page signed out.
  const signedIn = useSyncExternalStore(subscribe, hasSession, () => false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)

  useEffect(() => {
    const previous = document.title
    document.title = `${copy.title} · JOffers`
    return () => {
      document.title = previous
    }
  }, [copy.title])

  async function signOut() {
    setSigningOut(true)
    setSignOutFailed(false)
    try {
      const { supabase } = await import('../lib/supabase')
      // Its error alone doesn't say: a failed server call still clears the session here.
      // What does is the stored session, left only when it couldn't be read (an expired
      // token that can't be refreshed offline).
      await supabase.auth.signOut()
      if (hasSession()) setSignOutFailed(true)
      else navigate('/')
    } catch {
      // The auth chunk didn't load (offline, or a deploy removed it).
      setSignOutFailed(true)
    } finally {
      setSigningOut(false)
    }
  }

  const updated = new Intl.DateTimeFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${UPDATED}T00:00:00Z`))

  return (
    <div className="privacy-page">
      <header className="privacy-bar">
        <Link href="/" className="privacy-bar__home">
          <Logo />
        </Link>
        {signedIn && (
          <Button variant="ghost" size="sm" icon={LogOut} loading={signingOut} onClick={signOut}>
            {copy.signOut}
          </Button>
        )}
      </header>

      <main className="privacy">
        {/* The page's one status region: what Sign out did when it couldn't. */}
        <div role="status" className="privacy__status">
          {signOutFailed && <Callout tone="danger" title={copy.signOutFailed} />}
        </div>
        <Link href="/" className="privacy__back">
          <Icon icon={ArrowLeft} />
          {copy.back}
        </Link>
        <h1 className="privacy__title">{copy.title}</h1>
        <p className="privacy__updated">
          <time dateTime={UPDATED}>{copy.updated(updated)}</time>
        </p>
        <p className="privacy__lede">{copy.intro}</p>

        <section>
          <h2>{copy.controller.heading}</h2>
          <p>{CONTROLLER_NAME ? copy.controller.body(CONTROLLER_NAME) : copy.controller.unnamed}</p>
          {CONTACT_EMAIL && (
            <p>
              {copy.controller.contact} <Mailto />
            </p>
          )}
        </section>

        <section>
          <h2>{copy.data.heading}</h2>
          <ul>
            <li>{copy.data.email}</li>
            <li>{copy.data.tracking}</li>
            <li>{copy.data.logs}</li>
          </ul>
          <p>{copy.data.offers}</p>
        </section>

        <section>
          <h2>{copy.basis.heading}</h2>
          <ul>
            <li>{copy.basis.account}</li>
            <li>{copy.basis.security}</li>
          </ul>
        </section>

        <section>
          <h2>{copy.processors.heading}</h2>
          <p>{copy.processors.intro}</p>
          {/* Company names are not translated. */}
          <ul>
            <li>
              <strong>Supabase</strong>: {copy.processors.supabase}
            </li>
            <li>
              <strong>Google</strong>: {copy.processors.google}
            </li>
            <li>
              <strong>GitHub</strong>: {copy.processors.github}
            </li>
          </ul>
          <p>{copy.processors.transfers}</p>
        </section>

        <section>
          <h2>{copy.storage.heading}</h2>
          <p>{copy.storage.intro}</p>
          <table className="privacy__table">
            <thead>
              <tr>
                <th scope="col">{copy.storage.entry}</th>
                <th scope="col">{copy.storage.purpose}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(copy.storage.purposes).map(([key, purpose]) => (
                <tr key={key}>
                  <th scope="row">
                    <code translate="no">{key}</code>
                  </th>
                  <td>{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{copy.storage.clear}</p>
        </section>

        <section>
          <h2>{copy.noTracking.heading}</h2>
          <p>{copy.noTracking.body}</p>
        </section>

        <section>
          <h2>{copy.retention.heading}</h2>
          <ul>
            <li>{copy.retention.account}</li>
            <li>{copy.retention.offers}</li>
            <li>{copy.retention.logs}</li>
          </ul>
        </section>

        <section>
          <h2>{copy.rights.heading}</h2>
          <p>{copy.rights.list}</p>
          {CONTACT_EMAIL && (
            <p>
              {copy.rights.how} <Mailto />.
            </p>
          )}
          <p>
            {copy.rights.complaint}{' '}
            <a href={PUODO_URL}>uodo.gov.pl</a>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
