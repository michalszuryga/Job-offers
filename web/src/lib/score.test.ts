import { describe, expect, test } from 'vitest'
import { scoreBand } from './score'

describe('scoreBand', () => {
  test.each([
    [100, 'top'],
    [80, 'top'],
    [79, 'strong'],
    [65, 'strong'],
    [64, 'fair'],
    [50, 'fair'],
    [49, 'low'],
    [0, 'low'],
    [null, 'none'],
  ] as const)('%s → %s', (score, band) => {
    expect(scoreBand(score)).toBe(band)
  })

  test('bands the rounded score, matching the number on screen', () => {
    expect(scoreBand(79.5)).toBe('top')
    expect(scoreBand(64.4)).toBe('fair')
  })
})
