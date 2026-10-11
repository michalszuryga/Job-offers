import { describe, expect, test } from 'vitest'
import { loadSeen, parseSeen, saveSeen, SEEN_KEY } from './seen'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('joffers-seen', () => {
  test('parses a list of ids and ignores anything else', () => {
    expect(parseSeen(JSON.stringify(['a', 'b', 3, '', null, 'a']))).toEqual(new Set(['a', 'b']))
    for (const raw of [null, '', '{', '{"a":1}', '"a"']) expect(parseSeen(raw), String(raw)).toEqual(new Set())
  })

  test('round-trips, keeping only the newest 500', () => {
    const storage = memoryStorage()
    saveSeen(new Set(['x', 'y']), storage)
    expect(JSON.parse(storage.data.get(SEEN_KEY)!)).toEqual(['x', 'y'])
    expect(loadSeen(storage)).toEqual(new Set(['x', 'y']))

    saveSeen(new Set(Array.from({ length: 600 }, (_, i) => `id${i}`)), storage)
    const kept = loadSeen(storage)
    expect(kept.size).toBe(500)
    expect(kept.has('id599') && !kept.has('id99')).toBe(true)

    saveSeen(new Set(), storage)
    expect(loadSeen(storage)).toEqual(new Set())
  })

  test('survives storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(loadSeen(broken)).toEqual(new Set())
    expect(() => saveSeen(new Set(['a']), broken)).not.toThrow()
    expect(loadSeen(null)).toEqual(new Set())
  })
})
