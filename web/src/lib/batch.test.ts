import { describe, expect, test } from 'vitest'
import { bestOffer, inProgress, isReviewed, newOffers, nextFetchToday, reviewedCount } from './batch'
import type { Offer, Status } from './types'

function offer(id: string, score: number | null, status: Status | null = 'TO_REVIEW'): Offer {
  return {
    external_id: id, title: id, company: null, url: `https://board.test/${id}`, source: 'Board', location: null,
    contract: null, salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
    published_at: null, score, application_status: status, applied_rate: '', notice_period: '', applied_at: null,
  }
}

const offers = [offer('a', 82), offer('b', 75, 'REVIEW'), offer('c', null), offer('d', 60, 'APPLIED'), offer('e', 90, null)]

describe('the New batch', () => {
  test('is the new ids among the loaded offers, in list order', () => {
    const batch = newOffers(offers, new Set(['c', 'a', 'gone', 'b']))
    expect(batch.map((o) => o.external_id)).toEqual(['a', 'b', 'c'])
  })

  test('reviewed: past To review, or seen on this device', () => {
    expect(isReviewed(offers[0], new Set())).toBe(false)
    expect(isReviewed(offers[1], new Set())).toBe(true)
    expect(isReviewed(offers[4], new Set())).toBe(false)
    expect(isReviewed(offers[0], new Set(['a']))).toBe(true)
    expect(reviewedCount(offers, new Set(['a']))).toBe(3)
  })

  test('the best match is the top score; unscored never wins', () => {
    expect(bestOffer(offers)?.external_id).toBe('e')
    expect(bestOffer([offer('x', null), offer('y', 10)])?.external_id).toBe('y')
    expect(bestOffer([offer('x', null)])).toBeNull()
    expect(bestOffer([])).toBeNull()
  })

  test('in progress counts Preparing and Active', () => {
    const pipeline = [offer('1', 1, 'INTERESTED'), offer('2', 1, 'READY_TO_APPLY'), offer('3', 1, 'INTERVIEW'),
      offer('4', 1, 'REJECTED'), offer('5', 1, 'REVIEW')]
    expect(inProgress(pipeline)).toEqual({ preparing: 2, active: 1 })
  })
})

describe('nextFetchToday (12:00 Europe/Warsaw)', () => {
  test.each([
    // CEST (UTC+2) and CET (UTC+1): the cut-off follows Warsaw time, not UTC.
    ['2026-10-08T09:59:00Z', true],
    ['2026-10-08T10:00:00Z', false],
    ['2026-12-08T10:59:00Z', true],
    ['2026-12-08T11:00:00Z', false],
    ['2026-12-08T23:30:00Z', true],
  ])('%s → today %s', (iso, today) => {
    expect(nextFetchToday(Date.parse(iso))).toBe(today)
  })
})
