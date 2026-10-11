import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { signInErrorKey, type SignInErrorKey } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'error'; key: SignInErrorKey; detail: string }

export function Login() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setState({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setState(error ? { kind: 'error', key: signInErrorKey(error), detail: error.message } : { kind: 'sent', email })
  }

  return (
    <main className="login">
      <h1>JOffers</h1>
      <p className="muted">{t.login.tagline}</p>
      {state.kind === 'sent' ? (
        <p role="status">
          {t.login.sent.before}
          <strong>{state.email}</strong>
          {t.login.sent.after}
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="email">{t.login.email}</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? t.login.sending : t.login.send}
          </button>
          {state.kind === 'error' && (
            <div className="error" role="alert">
              <p>{t.login.errors[state.key]}</p>
              {state.detail && (
                <details className="technical">
                  <summary>{t.common.technicalDetails}</summary>
                  <p>{state.detail}</p>
                </details>
              )}
            </div>
          )}
        </form>
      )}
    </main>
  )
}
