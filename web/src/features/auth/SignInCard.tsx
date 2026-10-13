import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import { Link } from 'wouter'
import { Button, Callout, TextField } from '../../components/ui'
import { useI18n } from '../../i18n'
import { codeErrorKey, signInErrorKey, type AuthErrorKey } from '../../lib/authErrors'
import type { AuthNotice } from '../../lib/authHash'
import { SIGN_IN_ID } from '../landing/anchors'
import { accessRequestHref } from './contact'
import './authScreen.css'
import './SignInCard.css'

export type SignInNotice = AuthNotice | 'sessionExpired'

// Supabase sends one link per address per 60 s by default (Authentication → Rate limits).
const RESEND_SECONDS = 60
const GMAIL_URL = 'https://mail.google.com/'

// Loaded on use rather than imported: the landing must not ship supabase-js. Focusing a field
// starts the download, so a submit rarely waits for it; after a sign-out AppRoot already has
// the module, so this resolves at once.
const auth = () => import('../../lib/supabase').then(({ supabase }) => supabase.auth)
const warmUp = () => {
  auth().catch(() => undefined)
}

type Phase = { kind: 'form' } | { kind: 'sent'; email: string; resent: boolean; until: number }
type Failure = { key: AuthErrorKey; detail: string }
type FocusTarget = 'email' | 'sent' | 'code'

const detailOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Whole seconds left until `until` (a Date.now() time), ticking once a second.
function useSecondsLeft(until: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (until == null) return
    const timer = setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [until])
  // Capped: until the first tick `now` is older than the send that set `until`.
  return until == null ? 0 : Math.min(RESEND_SECONDS, Math.max(0, Math.ceil((until - now) / 1000)))
}

interface Props {
  notice: SignInNotice | null
  // A code signed in. Under AppRoot its auth listener takes over instead, so it may be absent.
  onSignedIn?: () => void
}

// The landing's sign-in card for beta members (plan §4.2): magic link first, a one-time code
// as the fallback for the installed iOS app (the link opens in Safari, not in the app).
// Sign-up stays closed.
export function SignInCard({ notice, onSignedIn }: Props) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [codeOpen, setCodeOpen] = useState(false)
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  // The notice stands until a new link has gone out.
  const [linkSent, setLinkSent] = useState(false)
  const secondsLeft = useSecondsLeft(phase.kind === 'sent' ? phase.until : null)

  const noticeId = useId()
  const titleId = useId()
  const emailRef = useRef<HTMLInputElement>(null)
  const sentRef = useRef<HTMLParagraphElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  // Where focus goes once the next render is on screen, so it never drops to <body> when
  // the control that had it unmounts. A notice (expired link or session) starts on the field.
  const focusNext = useRef<FocusTarget | null>(notice ? 'email' : null)
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    ;({ email: emailRef, sent: sentRef, code: codeRef })[target].current?.focus()
  })

  // Opened as ./#sign-in (the demo's Sign in link), or the nav's link clicked before this
  // chunk arrived: bring the card into view and onto the focus path.
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (location.hash !== `#${SIGN_IN_ID}`) return
    cardRef.current?.scrollIntoView({ block: 'start' })
    cardRef.current?.focus({ preventScroll: true })
  }, [])

  // Bumped by every request and by "Use a different email", so a reply that arrives after
  // the user has moved on (a resend for the old address) changes nothing.
  const request = useRef(0)

  // Runs one auth call; the failure it reports, if any, only lands while it is still current.
  async function run(kind: 'send' | 'verify', call: () => Promise<Failure | null>): Promise<boolean> {
    const id = ++request.current
    setBusy(kind)
    setFailure(null)
    const failed = await call()
    if (id !== request.current) return false
    setBusy(null)
    setFailure(failed)
    return !failed
  }

  const send = (address: string) =>
    run('send', async () => {
      try {
        const { error } = await (await auth()).signInWithOtp({
          email: address,
          // The implicit flow lands on BASE_URL with #access_token (see lib/supabase.ts).
          options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL, shouldCreateUser: false },
        })
        return error ? { key: signInErrorKey(error), detail: error.message } : null
      } catch (error) {
        return { key: 'generic', detail: detailOf(error) }
      }
    })

  async function submitEmail(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!(await send(address))) return
    setLinkSent(true)
    focusNext.current = 'sent'
    setPhase({ kind: 'sent', email: address, resent: false, until: Date.now() + RESEND_SECONDS * 1000 })
  }

  async function resend() {
    if (phase.kind !== 'sent' || busy || secondsLeft > 0) return
    if (await send(phase.email)) setPhase({ ...phase, resent: true, until: Date.now() + RESEND_SECONDS * 1000 })
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    // Before a link went out from this page (the installed app reloaded while the user was
    // in Mail), the code goes with the address in the field, which must be filled in.
    const field = emailRef.current
    if (phase.kind === 'form' && field && !field.reportValidity()) {
      field.focus()
      return
    }
    const address = phase.kind === 'sent' ? phase.email : email.trim()
    const signedIn = await run('verify', async () => {
      try {
        // On success AppRoot's onAuthStateChange swaps this card for the app.
        const { error } = await (await auth()).verifyOtp({ email: address, token: code, type: 'email' })
        return error ? { key: codeErrorKey(error), detail: error.message } : null
      } catch (error) {
        return { key: 'codeFailed', detail: detailOf(error) }
      }
    })
    if (signedIn) onSignedIn?.()
  }

  function changeEmail() {
    request.current++
    setBusy(null)
    focusNext.current = 'email'
    setPhase({ kind: 'form' })
    setEmail('')
    setCode('')
    setCodeOpen(false)
    setFailure(null)
  }

  function openCode() {
    focusNext.current = 'code'
    setCodeOpen(true)
  }

  const shownNotice = phase.kind === 'form' && !linkSent ? notice : null
  const requestHref = failure?.key === 'privateBeta' ? accessRequestHref(t.login.requestBody(email.trim())) : null
  const sentCopy = phase.kind === 'sent' && phase.resent ? t.login.resent : t.login.sent

  return (
    // The nav's "Sign in" scrolls here (and focuses it, so keyboard users land on the card).
    <section ref={cardRef} id={SIGN_IN_ID} className="sign-in" aria-labelledby={titleId} tabIndex={-1}>
      <h2 id={titleId} className="sign-in__title">
        {t.login.title}
      </h2>

      {shownNotice && (
        <Callout tone={shownNotice === 'linkExpired' ? 'warning' : 'info'}>
          <span id={noticeId}>{t.login.notices[shownNotice]}</span>
        </Callout>
      )}

      {/* The view's one live region: what the last action did, sent or failed. */}
      <div role="status" className="auth-card__status">
        {phase.kind === 'sent' && (
          <div className="sign-in__sent">
            <p ref={sentRef} tabIndex={-1} className="sign-in__sent-text">
              {sentCopy.before}
              <strong>{phase.email}</strong>
              {sentCopy.after}
            </p>
            <p className="auth-card__lede">{t.login.anyDevice}</p>
          </div>
        )}
        {failure && (
          <Callout tone="danger" details={failure.detail}>
            {t.login.errors[failure.key]}
            {failure.key === 'privateBeta' && (
              <>
                {' '}
                <Link href="/demo">{t.login.tryDemo}</Link>
                {requestHref && (
                  <>
                    {` ${t.login.or} `}
                    <a href={requestHref}>{t.login.requestAccess}</a>
                  </>
                )}
                .
              </>
            )}
          </Callout>
        )}
      </div>

      <div className="sign-in__next">
        {phase.kind === 'form' ? (
          <form className="sign-in__form" onSubmit={submitEmail}>
            <TextField
              ref={emailRef}
              type="email"
              name="email"
              label={t.login.email}
              hint={t.login.hint}
              aria-describedby={shownNotice ? noticeId : undefined}
              autoComplete="email"
              spellCheck={false}
              required
              onFocus={warmUp}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" fullWidth loading={busy === 'send'}>
              {t.login.send}
            </Button>
          </form>
        ) : (
          <div className="auth-card__actions">
            {/@gmail\.com$/i.test(phase.email) && (
              <Button href={GMAIL_URL} target="_blank" rel="noopener noreferrer" trailingIcon={ExternalLink} fullWidth>
                {t.login.openGmail}
              </Button>
            )}
            <Button
              variant="secondary"
              fullWidth
              className="sign-in__resend"
              // Not `disabled`: focus stays on the button through the countdown.
              aria-disabled={secondsLeft > 0 || undefined}
              loading={busy === 'send'}
              onClick={resend}
            >
              {secondsLeft > 0 ? t.login.resendIn(secondsLeft) : t.login.resend}
            </Button>
            <Button variant="ghost" fullWidth onClick={changeEmail}>
              {t.login.differentEmail}
            </Button>
          </div>
        )}

        {/* Offered before a link is sent too: the installed iOS app may have reloaded while
            the user was in Mail, and a new link would void the code they're holding. */}
        {codeOpen ? (
          <form className="sign-in__form sign-in__code" onSubmit={submitCode}>
            <TextField
              ref={codeRef}
              name="code"
              label={t.login.code}
              hint={t.login.codeHint}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              required
              onFocus={warmUp}
              value={code}
              // Digits only: a pasted "123 456" still fits.
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button type="submit" fullWidth loading={busy === 'verify'}>
              {t.login.verify}
            </Button>
          </form>
        ) : (
          // Replaced by the form it opens, which takes the focus.
          <Button variant="ghost" fullWidth onClick={openCode}>
            {t.login.haveCode}
          </Button>
        )}
      </div>
    </section>
  )
}
