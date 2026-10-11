import { browserStorage, type Store } from './prefs'

// Offers opened on this device whose promotion to Reviewed hasn't reached the database
// (§4.5, offline or a failed write). They count as reviewed here, and the write is retried
// on the next load; an id leaves once it is saved or the offer is gone.
export const SEEN_KEY = 'joffers-seen'

// A long offline spell can't grow it without bound; the oldest ids go first.
const MAX_IDS = 500

export function parseSeen(raw: string | null): Set<string> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== '') : [])
  } catch {
    return new Set()
  }
}

export function loadSeen(storage: Store | null = browserStorage()): Set<string> {
  try {
    return parseSeen(storage?.getItem(SEEN_KEY) ?? null)
  } catch {
    return new Set()
  }
}

// An empty set is saved as [] rather than removed, so the Store needs no removeItem.
export function saveSeen(seen: ReadonlySet<string>, storage: Store | null = browserStorage()): void {
  try {
    storage?.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-MAX_IDS)))
  } catch {
    // Blocked storage: the offer still counts as reviewed until this tab closes.
  }
}
