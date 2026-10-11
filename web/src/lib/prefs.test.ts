import { describe, expect, test } from 'vitest'
import { DEFAULT_FILTERS, FILTERS_KEY, loadFilters, parseFilters, saveFilters } from './prefs'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('parseFilters', () => {
  test('defaults when nothing usable is stored', () => {
    for (const raw of [null, '', '{', 'null', '[]', '42', '"24h"']) expect(parseFilters(raw), String(raw)).toEqual(DEFAULT_FILTERS)
  })

  test('keeps valid values', () => {
    const stored = { window: 'any', minScore: 65, status: 'APPLIED', source: 'No Fluff Jobs', query: 'gamma' }
    expect(parseFilters(JSON.stringify(stored))).toEqual(stored)
  })

  test('replaces only the invalid fields', () => {
    const stored = { window: 'new', minScore: '70', status: 'DISMISSED', source: 3, query: null }
    expect(parseFilters(JSON.stringify(stored))).toEqual(DEFAULT_FILTERS)
    expect(parseFilters(JSON.stringify({ window: '3d', status: 'WEIRD' }))).toEqual({ ...DEFAULT_FILTERS, window: '3d' })
  })

  test('clamps the score to 0–100 and drops unknown keys', () => {
    expect(parseFilters(JSON.stringify({ minScore: 250, hideReviewed: true }))).toEqual({ ...DEFAULT_FILTERS, minScore: 100 })
    expect(parseFilters(JSON.stringify({ minScore: -5 })).minScore).toBe(0)
  })

  test('the P3 defaults are unchanged', () => {
    expect(DEFAULT_FILTERS).toEqual({ window: '24h', minScore: 0, status: 'ALL', source: 'ALL', query: '' })
  })
})

describe('loadFilters / saveFilters', () => {
  test('round-trip through joffers-filters', () => {
    const storage = memoryStorage()
    const filters = { window: '7d', minScore: 50, status: 'REVIEW', source: 'ALL', query: 'qa' } as const
    saveFilters({ ...filters }, storage)
    expect(JSON.parse(storage.data.get(FILTERS_KEY)!)).toEqual(filters)
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
