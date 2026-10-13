import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'
import { AUTH_KEY } from './session'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see web/.env.example).')
}

const base = url.endsWith('/') ? url : `${url}/`

// The two parts of supabase-js the app uses (auth and PostgREST), wired the way its
// createClient wires them, without realtime, storage and functions (about 25 kB gzip).
// The publishable key is meant to be public; access is enforced by the RLS
// policies in db/web_access.sql.
const auth = new AuthClient({
  url: new URL('auth/v1', base).href,
  headers: { Authorization: `Bearer ${key}`, apikey: key },
  storageKey: AUTH_KEY,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  // Implicit flow: the magic link carries the session itself, so it still
  // works when the email is opened in a different browser than the one that
  // requested it (e.g. phone mail app vs. laptop).
  flowType: 'implicit',
})

// supabase-js's fetchWithAuth: every PostgREST call carries the key and the signed-in
// user's access token (the key when signed out), read per request so refreshes apply.
const fetchWithAuth: typeof fetch = async (input, init) => {
  const { data } = await auth.getSession()
  const headers = new Headers(init?.headers)
  if (!headers.has('apikey')) headers.set('apikey', key)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${data.session?.access_token ?? key}`)
  return fetch(input, { ...init, headers })
}

const rest = new PostgrestClient(new URL('rest/v1', base).href, { schema: 'public', fetch: fetchWithAuth })

export const supabase = {
  auth,
  from: (relation: string) => rest.from(relation),
  rpc: rest.rpc.bind(rest),
}
