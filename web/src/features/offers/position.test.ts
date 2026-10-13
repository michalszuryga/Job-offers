import { describe, expect, test } from 'vitest'
import { listPosition } from './position'

const offer = (id: string, score: number) => ({ external_id: id, score })
const byScore = (offers: { external_id: string; score: number }[]) => [...offers].sort((a, b) => b.score - a.score)

describe('listPosition', () => {
  const a = offer('a', 90)
  const b = offer('b', 70)
  const c = offer('c', 50)

  test('the neighbours in the visible list', () => {
    expect(listPosition([a, b, c], b, byScore)).toEqual({ index: 1, total: 3, previousId: 'a', nextId: 'c' })
  })

  test('none past either end: Not for me on the last offer closes the details', () => {
    expect(listPosition([a, b, c], a, byScore)).toMatchObject({ previousId: null, nextId: 'b' })
    expect(listPosition([a, b, c], c, byScore)).toMatchObject({ previousId: 'b', nextId: null })
    expect(listPosition([a], a, byScore)).toEqual({ index: 0, total: 1, previousId: null, nextId: null })
  })

  test('an offer the filter no longer shows keeps its sorted place', () => {
    // b was To review and is now Reviewed (or Not for me) under a "To review" filter.
    expect(listPosition([a, c], b, byScore)).toEqual({ index: 1, total: 3, previousId: 'a', nextId: 'c' })
  })
})
