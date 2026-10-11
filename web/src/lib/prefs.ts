import { STATUSES, type Status } from './types'

// Filters stay in localStorage (plan header). The v2 shape and its migration are P6.
export const FILTERS_KEY = 'joffers-filters'

export const PUBLISHED_WINDOWS = ['any', '24h', '3d', '7d'] as const
export type PublishedWindow = (typeof PUBLISHED_WINDOWS)[number]

export interface Filters {
  window: PublishedWindow
  minScore: number
  status: Status | 'ALL'
  source: string
  query: string
}

export const DEFAULT_FILTERS: Readonly<Filters> = { window: '24h', minScore: 0, status: 'ALL', source: 'ALL', query: '' }

type Store = Pick<Storage, 'getItem' | 'setItem'>

// Reading localStorage itself throws when storage is blocked, not just its methods.
function browserStorage(): Store | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Field by field, so one bad value (a hand edit, an older build) doesn't reset the rest.
export function parseFilters(raw: string | null): Filters {
  let stored: unknown = null
  try {
    stored = raw ? JSON.parse(raw) : null
  } catch {
    // Corrupt JSON: same as nothing stored.
  }
  if (!isRecord(stored)) return { ...DEFAULT_FILTERS }
  const { window, minScore, status, source, query } = stored
  return {
    window: PUBLISHED_WINDOWS.includes(window as PublishedWindow) ? (window as PublishedWindow) : DEFAULT_FILTERS.window,
    minScore:
      typeof minScore === 'number' && Number.isFinite(minScore)
        ? Math.min(100, Math.max(0, minScore))
        : DEFAULT_FILTERS.minScore,
    status: status === 'ALL' || STATUSES.includes(status as Status) ? (status as Filters['status']) : DEFAULT_FILTERS.status,
    source: typeof source === 'string' ? source : DEFAULT_FILTERS.source,
    query: typeof query === 'string' ? query : DEFAULT_FILTERS.query,
  }
}

export function loadFilters(storage: Store | null = browserStorage()): Filters {
  try {
    return parseFilters(storage?.getItem(FILTERS_KEY) ?? null)
  } catch {
    return { ...DEFAULT_FILTERS }
  }
}

export function saveFilters(filters: Filters, storage: Store | null = browserStorage()): void {
  const { window, minScore, status, source, query } = filters
  try {
    storage?.setItem(FILTERS_KEY, JSON.stringify({ window, minScore, status, source, query }))
  } catch {
    // Private mode, quota or blocked storage: filters just won't be remembered.
  }
}
