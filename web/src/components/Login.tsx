import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string }

export function Login() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(event: FormEvent) {
    event.preventDefault()
    setState({ kind: 'sending' })
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setState(error ? { kind: 'error', message: error.message } : { kind: 'sent', email })
  }

  return (
    <main className="login">
      <h1>JOffers</h1>
      <p className="muted">QA job offers, scored for you.</p>
      {state.kind === 'sent' ? (
        <p role="status">
          Check your inbox — we sent a sign-in link to <strong>{state.email}</strong>.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>
          {state.kind === 'error' && (
            <p className="error" role="alert">
              {state.message}
            </p>
          )}
        </form>
      )}
    </main>
  )
}
