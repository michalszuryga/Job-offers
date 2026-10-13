import { describe, expect, test } from 'vitest'
import {
  activeFilters, clearFilters, DEFAULT_FILTERS, FILTERS_KEY, loadFilters, MIN_SCORES, parseFilters, saveFilters,
  snapMinScore, type Filters,
} from './prefs'
import { BAND_THRESHOLDS } from './score'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

const v2 = (value: Record<string, unknown>) => JSON.stringify({ v: 2, ...value })

describe('parseFilters', () => {
  test('defaults when nothing usable is stored', () => {
    for (const raw of [null, '', '{', 'null', '[]', '42', '"24h"']) expect(parseFilters(raw), String(raw)).toEqual(DEFAULT_FILTERS)
  })

  test('keeps valid v2 values', () => {
    const stored = { window: '24h', minScore: 65, status: 'APPLIED', source: 'No Fluff Jobs', query: 'gamma', sort: 'salary' }
    expect(parseFilters(v2(stored))).toEqual(stored)
  })

  test('replaces only the invalid fields', () => {
    const stored = { window: 'week', minScore: '70', status: 'ARCHIVED', source: 3, query: null, sort: 'random' }
    expect(parseFilters(v2(stored))).toEqual(DEFAULT_FILTERS)
    expect(parseFilters(v2({ window: '3d', status: 'WEIRD' }))).toEqual({ ...DEFAULT_FILTERS, window: '3d' })
  })

  test('the P6 defaults: the New view, best match first', () => {
    expect(DEFAULT_FILTERS).toEqual({ window: 'new', minScore: 0, status: 'ALL', source: 'ALL', query: '', sort: 'score' })
  })
})

describe('v1 → v2 migration', () => {
  test("a stored 24 h becomes New once; v2's 24 h stays", () => {
    expect(parseFilters(JSON.stringify({ window: '24h' })).window).toBe('new')
    expect(parseFilters(v2({ window: '24h' })).window).toBe('24h')
    // The other v1 windows mean what they always did.
    for (const window of ['any', '3d', '7d']) expect(parseFilters(JSON.stringify({ window })).window).toBe(window)
  })

  test('the migrated value is saved as v2, so the next load keeps a later 24 h', () => {
    const storage = memoryStorage({ [FILTERS_KEY]: JSON.stringify({ window: '24h', minScore: 70, hideReviewed: true }) })
    const migrated = loadFilters(storage)
    expect(migrated).toEqual({ ...DEFAULT_FILTERS, window: 'new', minScore: 65 })
    saveFilters({ ...migrated, window: '24h' }, storage)
    expect(loadFilters(storage).window).toBe('24h')
  })

  test('min score snaps down to a preset', () => {
    expect([-5, 0, 49, 50, 64, 65, 70, 79, 80, 100, 250].map(snapMinScore)).toEqual([0, 0, 0, 50, 50, 65, 65, 65, 80, 80, 80])
    expect(parseFilters(JSON.stringify({ minScore: 70 })).minScore).toBe(65)
    expect(parseFilters(v2({ minScore: 55 })).minScore).toBe(50)
  })

  test('hideReviewed and unknown keys are dropped', () => {
    const parsed = parseFilters(JSON.stringify({ hideReviewed: true, extra: 1 }))
    expect(parsed).toEqual(DEFAULT_FILTERS)
    expect(Object.keys(parsed)).not.toContain('hideReviewed')
  })

  test('the presets are the band thresholds', () => {
    expect(MIN_SCORES).toEqual([0, BAND_THRESHOLDS.fair, BAND_THRESHOLDS.strong, BAND_THRESHOLDS.top])
  })
})

describe('active filters', () => {
  test('the window and the sort are not filters', () => {
    expect(activeFilters({ ...DEFAULT_FILTERS, window: 'any', sort: 'newest' })).toEqual([])
    const busy: Filters = { ...DEFAULT_FILTERS, minScore: 65, status: 'REVIEW', source: 'Board', query: 'qa' }
    expect(activeFilters(busy)).toEqual(['minScore', 'status', 'source', 'query'])
  })

  test('clearing keeps the window and the sort', () => {
    const busy: Filters = { window: '7d', minScore: 80, status: 'APPLIED', source: 'Board', query: 'qa', sort: 'salary' }
    expect(clearFilters(busy)).toEqual({ ...DEFAULT_FILTERS, window: '7d', sort: 'salary' })
  })
})

describe('loadFilters / saveFilters', () => {
  test('round-trip through joffers-filters, versioned', () => {
    const storage = memoryStorage()
    const filters = { window: '7d', minScore: 50, status: 'REVIEW', source: 'ALL', query: 'qa', sort: 'newest' } as const
    saveFilters({ ...filters }, storage)
    expect(JSON.parse(storage.data.get(FILTERS_KEY)!)).toEqual({ v: 2, ...filters })
    expect(loadFilters(storage)).toEqual(filters)
  })

  test('survive storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadFilters(broken)).toEqual(DEFAULT_FILTERS)
    expect(() => saveFilters({ ...DEFAULT_FILTERS }, broken)).not.toThrow()
    expect(loadFilters(null)).toEqual(DEFAULT_FILTERS)
  })

  test('a load returns a fresh object, so callers can never mutate the defaults', () => {
    const loaded = loadFilters(memoryStorage())
    loaded.query = 'changed'
    expect(DEFAULT_FILTERS.query).toBe('')
  })
})
