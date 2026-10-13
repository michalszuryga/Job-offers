// What the page can tell about signing in before supabase-js loads (plan §4.1). Same rules
// as the head script in index.html, which sets html[data-boot=app] from them; keep the two
// in sync.

// supabase-js keeps the session here (lib/supabase.ts storageKey).
export const AUTH_KEY = 'joffers-auth'

// Signed in on this device = supabase-js has a stored session. Storage can throw (blocked).
export function hasStoredSession(): boolean {
  try {
    return globalThis.localStorage?.getItem(AUTH_KEY) != null
  } catch {
    return false
  }
}

// A magic link landing with its session in the fragment (the implicit flow).
export function hasTokenHash(hash: string): boolean {
  return new URLSearchParams(hash.replace(/^#/, '')).has('access_token')
}

// '/' goes to the app (and loads supabase-js) only when there is a session to pick up.
export function startsInApp(): boolean {
  if (typeof window === 'undefined') return false
  return hasTokenHash(window.location.hash) || hasStoredSession()
}
