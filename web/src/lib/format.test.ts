import { describe, expect, test } from 'vitest'
import {
  applyFilters, formatAgeShort, formatAgo, formatApproxMonthly, formatDateline, formatNumber, formatPoints, formatSalary, sortOffers,
  timeOf,
} from './format'
import { DEFAULT_FILTERS } from './prefs'
import type { Offer } from './types'

const NOW = Date.parse('2026-05-04T16:00:00Z')
const HOUR = 3_600_000
const ago = (ms: number) => new Date(NOW - ms).toISOString()
// Digit groups are joined by U+00A0 so an amount never wraps; the tests spell it out.
const nbsp = (text: string) => text.replace(/(?<=\d) (?=\d{3})/g, '\u00a0')

function offer(id: string, extra: Partial<Offer> = {}): Offer {
  return {
    external_id: id, title: id, company: null, url: `https://board.test/${id}`, source: 'Board', location: null,
    contract: null, salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
    published_at: null, score: null, application_status: 'TO_REVIEW', applied_rate: '', notice_period: '',
    applied_at: null, ...extra,
  }
}

describe('formatAgo', () => {
  test.each([
    [0, 'just now', 'przed chwilą'],
    [5 * 60_000, '5 min ago', '5 min temu'],
    [2 * HOUR, '2 h ago', '2 godz. temu'],
    [47 * HOUR, '47 h ago', '47 godz. temu'],
    [48 * HOUR, '2 days ago', '2 dni temu'],
    [22 * 24 * HOUR, '22 days ago', '22 dni temu'],
  ])('%i ms → "%s" / "%s"', (ms, en, pl) => {
    expect(formatAgo(ago(ms), 'en', NOW)).toBe(en)
    expect(formatAgo(ago(ms), 'pl', NOW)).toBe(pl)
  })

  test('a future date reads as now, a missing or broken one as unknown', () => {
    expect(formatAgo(ago(-HOUR), 'en', NOW)).toBe('just now')
    expect(formatAgo(null, 'en', NOW)).toBe('date unknown')
    expect(formatAgo('not a date', 'pl', NOW)).toBe('brak daty')
  })

  test('timeOf tells a usable date from a missing or broken one', () => {
    expect(timeOf(ago(HOUR))).toBe(NOW - HOUR)
    expect([timeOf(null), timeOf(undefined), timeOf(''), timeOf('not a date')]).toEqual([null, null, null, null])
  })
})

describe('formatAgeShort', () => {
  test.each([
    [20_000, 'now', 'teraz'],
    [5 * 60_000, '5 min', '5 min'],
    [3 * HOUR, '3 h', '3 godz.'],
    [3 * 24 * HOUR, '3 d', '3 dni'],
  ])('%i ms → "%s" / "%s"', (ms, en, pl) => {
    expect(formatAgeShort(ago(ms), 'en', NOW)).toBe(en)
    expect(formatAgeShort(ago(ms), 'pl', NOW)).toBe(pl)
  })
})

describe('formatSalary', () => {
  const salary = (min: number | null, max: number | null, currency: string | null, period: string | null) => ({
    salary_min: min, salary_max: max, salary_currency: currency, salary_period: period,
  })

  test('keeps the exact text the list e2e expects', () => {
    expect(formatSalary(salary(20000, 25000, 'PLN', 'month'), 'en')).toBe(nbsp('20 000–25 000 PLN/month'))
  })

  test.each([
    ['hour', '140–160 PLN/h', '140–160 PLN/godz.'],
    ['day', '140–160 PLN/day', '140–160 PLN/dzień'],
    ['month', '140–160 PLN/month', '140–160 PLN/mies.'],
    ['year', '140–160 PLN/year', '140–160 PLN/rok'],
    ['monthly', '140–160 PLN/month', '140–160 PLN/mies.'],
    ['', '140–160 PLN', '140–160 PLN'],
  ])('period %j', (period, en, pl) => {
    expect(formatSalary(salary(140, 160, 'PLN', period), 'en')).toBe(en)
    expect(formatSalary(salary(140, 160, 'PLN', period), 'pl')).toBe(pl)
  })

  test('numbers always use pl-PL grouping, even 4 digits', () => {
    expect(formatSalary(salary(4000, 12000.4, 'EUR', 'month'), 'en')).toBe(nbsp('4 000–12 000 EUR/month'))
  })

  test('one amount, or a range that rounds to one, shows once', () => {
    expect(formatSalary(salary(null, 9000, 'PLN', 'month'), 'pl')).toBe(nbsp('9 000 PLN/mies.'))
    expect(formatSalary(salary(150, 150.2, 'PLN', 'hour'), 'en')).toBe('150 PLN/h')
  })

  test('no amount, no text', () => {
    expect(formatSalary(salary(null, null, 'PLN', 'month'), 'en')).toBe('')
  })
})

test('formatApproxMonthly: only when the offer is not already PLN per month', () => {
  const hourly = { salary_min: 40, salary_max: 50, salary_currency: 'EUR', salary_period: 'hour' }
  expect(formatApproxMonthly(hourly, 'en')).toBe(nbsp('≈ 28 160 PLN/month'))
  expect(formatApproxMonthly(hourly, 'pl', { hours_per_month: 168 })).toBe(nbsp('≈ 29 568 PLN/mies.'))
  expect(formatApproxMonthly({ ...hourly, salary_currency: 'PLN', salary_period: 'month' }, 'en')).toBeNull()
  expect(formatApproxMonthly({ ...hourly, salary_currency: 'SEK' }, 'en')).toBeNull()
})

test('formatNumber: pl-PL grouping, the decimal mark follows the language', () => {
  expect(formatNumber(1234567, 'en')).toBe(nbsp('1 234 567'))
  expect(formatNumber(4.25, 'en', 1)).toBe('4.3')
  expect(formatNumber(4.25, 'pl', 1)).toBe('4,3')
  expect(formatNumber(0.4)).toBe('0')
})

describe('formatPoints', () => {
  test.each([
    [20, 'en', '+20'],
    [-15, 'en', '\u221215'],
    [0, 'en', '0'],
    [2.5, 'en', '+2.5'],
    [2.5, 'pl', '+2,5'],
  ] as const)('%d (%s) → %s', (points, lang, text) => {
    expect(formatPoints(points, lang)).toBe(text)
  })
})

describe('sortOffers', () => {
  const offers = [
    offer('unscored', { score: null, published_at: ago(HOUR) }),
    offer('low', { score: 40, published_at: ago(5 * HOUR), salary_min: 100, salary_currency: 'PLN', salary_period: 'hour' }),
    offer('high', { score: 90, published_at: null }),
    offer('mid', { score: 60, published_at: ago(2 * HOUR), salary_min: 20000, salary_currency: 'PLN', salary_period: 'month' }),
    offer('mid-newer', { score: 60, published_at: ago(HOUR) }),
  ]
  const ids = (list: Offer[]) => list.map((o) => o.external_id)

  test('score: best first, ties newest first, unscored last', () => {
    expect(ids(sortOffers(offers, 'score'))).toEqual(['high', 'mid-newer', 'mid', 'low', 'unscored'])
  })

  test('newest: undated last, ties by score', () => {
    expect(ids(sortOffers(offers, 'newest'))).toEqual(['mid-newer', 'unscored', 'mid', 'low', 'high'])
  })

  test('salary: by PLN per month using the profile, unknown last', () => {
    // 100 PLN/h × 160 h = 16 000 < 20 000/month; with 220 h it is 22 000 and moves up.
    expect(ids(sortOffers(offers, 'salary', {}))).toEqual(['mid', 'low', 'high', 'mid-newer', 'unscored'])
    expect(ids(sortOffers(offers, 'salary', { hours_per_month: 220 }))).toEqual(['low', 'mid', 'high', 'mid-newer', 'unscored'])
  })

  test('returns a new array and leaves the input alone', () => {
    const before = ids(offers)
    expect(sortOffers(offers, 'score')).not.toBe(offers)
    expect(ids(offers)).toEqual(before)
  })
})

describe('applyFilters', () => {
  const offers = [
    offer('fresh', { score: 75, published_at: ago(3 * HOUR), company: 'Acme' }),
    offer('old', { score: 82, published_at: ago(120 * HOUR), company: 'Gamma' }),
    offer('undated', { score: 40, published_at: null, application_status: 'APPLIED' }),
  ]
  const ids = (list: Offer[]) => list.map((o) => o.external_id)
  const any = { ...DEFAULT_FILTERS, window: 'any' as const }

  test('New shows exactly the new ids, whatever their dates say', () => {
    const newIds = new Set(['old', 'undated'])
    expect(ids(applyFilters(offers, DEFAULT_FILTERS, { now: NOW, newIds }))).toEqual(['old', 'undated'])
    expect(applyFilters(offers, DEFAULT_FILTERS, { now: NOW })).toEqual([])
    // Other filters still narrow it.
    expect(ids(applyFilters(offers, { ...DEFAULT_FILTERS, minScore: 50 }, { now: NOW, newIds }))).toEqual(['old'])
  })

  test('the date windows hide old and undated offers', () => {
    expect(ids(applyFilters(offers, { ...any, window: '24h' }, { now: NOW }))).toEqual(['fresh'])
    expect(ids(applyFilters(offers, { ...any, window: '7d' }, { now: NOW }))).toEqual(['fresh', 'old'])
    expect(ids(applyFilters(offers, any, { now: NOW }))).toEqual(['fresh', 'old', 'undated'])
  })

  test('score, status, source and text', () => {
    expect(ids(applyFilters(offers, { ...any, minScore: 65 }, { now: NOW }))).toEqual(['fresh', 'old'])
    expect(ids(applyFilters(offers, { ...any, status: 'APPLIED' }, { now: NOW }))).toEqual(['undated'])
    expect(ids(applyFilters(offers, { ...any, status: 'TO_REVIEW' }, { now: NOW }))).toEqual(['fresh', 'old'])
    expect(ids(applyFilters(offers, { ...any, source: 'Other' }, { now: NOW }))).toEqual([])
    expect(ids(applyFilters(offers, { ...any, query: 'gam' }, { now: NOW }))).toEqual(['old'])
  })
})

describe('formatDateline', () => {
  test('is the Warsaw day, written out', () => {
    // 23:30 UTC is already the next day in Warsaw (UTC+2 in October).
    const late = Date.parse('2026-10-13T23:30:00Z')
    expect(formatDateline('en', late)).toBe('Wednesday 14 October')
    expect(formatDateline('pl', late)).toBe('środa, 14 października')
  })
})
