import { BAND_THRESHOLDS } from './score'
import { STATUSES, type Status } from './types'

// Filters stay in localStorage (plan header). Saved with a version since P6 (v2), so the
// one-time migration below can tell an old value from one picked since.
export const FILTERS_KEY = 'joffers-filters'
const VERSION = 2

// 'new' is the last fetch's new offers whatever their dates say (§4.5); the rest go by
// publication date. In toolbar order.
export const PUBLISHED_WINDOWS = ['new', '24h', '3d', '7d', 'any'] as const
export type PublishedWindow = (typeof PUBLISHED_WINDOWS)[number]

// Min score presets: the score bands' lower edges (§4.6).
export const MIN_SCORES = [0, BAND_THRESHOLDS.fair, BAND_THRESHOLDS.strong, BAND_THRESHOLDS.top] as const
export type MinScore = (typeof MIN_SCORES)[number]

export const SORT_KEYS = ['score', 'newest', 'salary'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export interface Filters {
  window: PublishedWindow
  minScore: MinScore
  status: Status | 'ALL'
  source: string
  query: string
  sort: SortKey
}

export const DEFAULT_FILTERS: Readonly<Filters> = {
  window: 'new',
  minScore: 0,
  status: 'ALL',
  source: 'ALL',
  query: '',
  sort: 'score',
}

// What narrows the list beyond the time window: the chips, the Filters badge and "Clear all".
export const FILTER_FIELDS = ['minScore', 'status', 'source', 'query'] as const
export type FilterField = (typeof FILTER_FIELDS)[number]

export function activeFilters(filters: Filters): FilterField[] {
  return FILTER_FIELDS.filter((field) => filters[field] !== DEFAULT_FILTERS[field])
}

// The window and the sort stay: neither is a filter you clear.
export function clearFilters(filters: Filters): Filters {
  return { ...filters, minScore: 0, status: 'ALL', source: 'ALL', query: '' }
}

// The highest preset at or below `score`: a v1 free-typed 70 becomes 65, never 80.
export function snapMinScore(score: number): MinScore {
  return [...MIN_SCORES].reverse().find((preset) => score >= preset) ?? 0
}

export type Store = Pick<Storage, 'getItem' | 'setItem'>

// Reading localStorage itself throws when storage is blocked, not just its methods.
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => list.includes(value as T)

// Field by field, so one bad value (a hand edit, an older build) doesn't reset the rest.
// v1 (no version) is migrated once: its default '24h' meant "what's new", which is the New
// view now; saved back as v2, a 24 h picked later stays. hideReviewed is dropped ("To review"
// in Status replaces it).
export function parseFilters(raw: string | null): Filters {
  let stored: unknown = null
  try {
    stored = raw ? JSON.parse(raw) : null
  } catch {
    // Corrupt JSON: same as nothing stored.
  }
  if (!isRecord(stored)) return { ...DEFAULT_FILTERS }
  const { window, minScore, status, source, query, sort } = stored
  const legacy = !('v' in stored)
  const published = legacy && window === '24h' ? 'new' : window
  return {
    window: oneOf(PUBLISHED_WINDOWS, published) ? published : DEFAULT_FILTERS.window,
    minScore: typeof minScore === 'number' && Number.isFinite(minScore) ? snapMinScore(minScore) : DEFAULT_FILTERS.minScore,
    status: status === 'ALL' || oneOf(STATUSES, status) ? status : DEFAULT_FILTERS.status,
    source: typeof source === 'string' ? source : DEFAULT_FILTERS.source,
    query: typeof query === 'string' ? query : DEFAULT_FILTERS.query,
    sort: oneOf(SORT_KEYS, sort) ? sort : DEFAULT_FILTERS.sort,
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
  const { window, minScore, status, source, query, sort } = filters
  try {
    storage?.setItem(FILTERS_KEY, JSON.stringify({ v: VERSION, window, minScore, status, source, query, sort }))
  } catch {
    // Private mode, quota or blocked storage: filters just won't be remembered.
  }
}
