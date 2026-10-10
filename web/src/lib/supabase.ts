import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see web/.env.example).')
}

// The publishable key is meant to be public; access is enforced by the RLS
// policies in db/web_access.sql.
export const supabase = createClient(url, key, {
  auth: {
    storageKey: 'joffers-auth',
    // Implicit flow: the magic link carries the session itself, so it still
    // works when the email is opened in a different browser than the one that
    // requested it (e.g. phone mail app vs. laptop).
    flowType: 'implicit',
  },
})
