// A failed magic link lands on BASE_URL with the reason in the fragment
// (#error=access_denied&error_code=otp_expired&error_description=…). main.tsx calls
// captureAuthHash() before anything imports lib/supabase: supabase-js (detectSessionInUrl)
// would otherwise consume that fragment and only log it. A #access_token fragment is the
// sign-in itself and is left for supabase-js.

export type AuthNotice = 'linkExpired'

const ERROR_PARAMS = ['error', 'error_code', 'error_description']

let pending: AuthNotice | null = null

// Every link failure has the same way out (send a new link), so all of them read as expired.
// Other fragments (#offers from the skip link) are not ours.
export function parseAuthHash(hash: string): AuthNotice | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (params.has('access_token')) return null
  return ERROR_PARAMS.some((name) => params.has(name)) ? 'linkExpired' : null
}

type Win = { location: Pick<Location, 'hash' | 'pathname' | 'search'>; history: Pick<History, 'state' | 'replaceState'> }

// Remembers the notice and strips the fragment, keeping the path, the query (?offer=) and
// the history state, so a reload or a shared URL doesn't show the error again.
export function captureAuthHash(win: Win = window): void {
  const notice = parseAuthHash(win.location.hash)
  if (!notice) return
  pending = notice
  win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search)
}

// Hands the notice over once (AppRoot shows it on the sign-in card).
export function takeAuthNotice(): AuthNotice | null {
  const notice = pending
  pending = null
  return notice
}
