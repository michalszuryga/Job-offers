import { describe, expect, test } from 'vitest'
import fixture from './__fixtures__/breakdown.json'
import {
  breakdownRows,
  CATEGORY_ROWS,
  categoryMax,
  parseBreakdown,
  PENALTY_KEYS,
  SCORE_DEFAULTS,
  scoreBand,
  scoreModel,
  scoringFrom,
  type Breakdown,
} from './score'
import scoreDefaults from './score-defaults.json'

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

// Written by tests/test_web_contract.py from score_job() with config/profile.yaml.
interface FixtureCase {
  name: string
  score: number
  breakdown: Breakdown
}
const cases = fixture.cases as unknown as FixtureCase[]
const byName = (name: string) => {
  const found = cases.find((c) => c.name === name)
  if (!found) throw new Error(`breakdown.json has no "${name}" case`)
  return found
}

const KNOWN_NUMBERS = new Set<string>([...CATEGORY_ROWS.map((row) => row.key), ...PENALTY_KEYS])
const isNumber = (value: unknown): value is number => typeof value === 'number'

describe('breakdownRows against score_job() (breakdown.json)', () => {
  test('the fixture has the agreed cases', () => {
    expect(cases.map((c) => c.name).sort()).toEqual(
      ['capped', 'floored', 'penalties', 'strong-match', 'unknown-currency', 'yearly-usd'],
    )
  })

  test.each(cases)('$name: the total is the stored score', ({ breakdown, score }) => {
    expect(breakdownRows(breakdown, SCORE_DEFAULTS).total).toBe(score)
  })

  test.each(cases)('$name: rows and penalties add up to the raw sum', ({ breakdown }) => {
    const { rows, zeroRows, penalties, rawSum } = breakdownRows(breakdown, SCORE_DEFAULTS)
    const shown = [...rows, ...zeroRows, ...penalties].reduce((sum, row) => sum + row.points, 0)
    expect(shown).toBe(rawSum)
    const pythonSum = Object.values(breakdown).filter(isNumber).reduce((sum, value) => sum + value, 0)
    expect(rawSum).toBe(pythonSum)
  })

  // A new number in scoring.py must get a label here before it can reach the screen.
  test.each(cases)('$name: every number in the breakdown has a row or a penalty label', ({ breakdown }) => {
    const numbers = Object.keys(breakdown).filter((key) => isNumber(breakdown[key]))
    expect(numbers.filter((key) => !KNOWN_NUMBERS.has(key))).toEqual([])
    // And the other way round: no row is labelled for a key scoring.py doesn't write.
    expect([...KNOWN_NUMBERS].filter((key) => !numbers.includes(key))).toEqual([])
  })

  test.each(cases)('$name: no category scores above its maximum', ({ breakdown }) => {
    const { rows, zeroRows } = breakdownRows(breakdown, SCORE_DEFAULTS)
    for (const row of [...rows, ...zeroRows]) {
      expect(row.points, row.key).toBeGreaterThanOrEqual(0)
      expect(row.points, row.key).toBeLessThanOrEqual(row.max)
    }
  })

  test.each(cases)('$name: rows keep the §4.8 order and zero rows fold away', ({ breakdown }) => {
    const { rows, zeroRows } = breakdownRows(breakdown, SCORE_DEFAULTS)
    const order = CATEGORY_ROWS.map((row) => row.key)
    expect(rows.map((row) => row.key)).toEqual(order.filter((key) => breakdown[key] !== 0))
    expect(zeroRows.map((row) => row.key)).toEqual(order.filter((key) => breakdown[key] === 0))
  })

  test('a typical sum needs no note', () => {
    const summary = breakdownRows(byName('strong-match').breakdown, SCORE_DEFAULTS)
    expect(summary.rawSum).toBeGreaterThan(0)
    expect(summary.rawSum).toBeLessThan(100)
    expect(summary).toMatchObject({ total: summary.rawSum, note: null })
  })

  test('a sum above 100 is capped', () => {
    const summary = breakdownRows(byName('capped').breakdown, SCORE_DEFAULTS)
    expect(summary.rawSum).toBeGreaterThan(100)
    expect(summary).toMatchObject({ total: 100, note: 'capped' })
  })

  test('a sum below 0 is floored', () => {
    const summary = breakdownRows(byName('floored').breakdown, SCORE_DEFAULTS)
    expect(summary.rawSum).toBeLessThan(0)
    expect(summary).toMatchObject({ total: 0, note: 'floored' })
  })

  test('penalties keep their sign; the stale one says after how many days', () => {
    const { penalties } = scoreDefaults
    expect(breakdownRows(byName('penalties').breakdown, SCORE_DEFAULTS).penalties).toEqual([
      { key: 'title_automation_penalty', points: -penalties.automation_title },
      { key: 'title_programming_language_penalty', points: -penalties.programming_language_title },
      { key: 'stale_offer_penalty', points: -penalties.stale_offer, days: penalties.stale_after_days },
    ])
    expect(breakdownRows(byName('strong-match').breakdown, SCORE_DEFAULTS).penalties).toEqual([])
  })

  test('a partial or missing breakdown still renders every category', () => {
    const summary = breakdownRows({ role: 20, remote: 15, title_automation_penalty: 0, matched_roles: ['qa'] })
    expect(summary.rows.map((row) => row.key)).toEqual(['role', 'remote'])
    expect(summary.zeroRows).toHaveLength(CATEGORY_ROWS.length - 2)
    expect(summary).toMatchObject({ penalties: [], rawSum: 35, total: 35, note: null })
    expect(breakdownRows(null)).toMatchObject({ rows: [], rawSum: 0, total: 0, note: null })
  })
})

describe('category maxima', () => {
  test('come from score-defaults.json, at the §4.8 config paths', () => {
    expect(SCORE_DEFAULTS).toEqual(scoreDefaults)
    expect(Object.fromEntries(CATEGORY_ROWS.map((row) => [row.key, categoryMax(row, SCORE_DEFAULTS)]))).toEqual({
      role: scoreDefaults.weights.role,
      technology: scoreDefaults.weights.technologies,
      domain: scoreDefaults.weights.domain,
      remote: scoreDefaults.weights.remote,
      contract: scoreDefaults.weights.contract,
      seniority: scoreDefaults.weights.seniority,
      language: scoreDefaults.weights.language,
      ai: scoreDefaults.weights.ai,
      freshness: scoreDefaults.weights.recency_max,
      salary_bonus: scoreDefaults.salary_bonus.points,
    })
  })

  test("fall back to scoring.py's defaults for missing keys", () => {
    const maxima = breakdownRows({}, { weights: { role: 30 } }).zeroRows.map((row) => [row.key, row.max])
    expect(Object.fromEntries(maxima)).toMatchObject({ role: 30, technology: 0, freshness: 10, salary_bonus: 15 })
  })

  test('freshness never claims more than recency_points can give', () => {
    const freshness = CATEGORY_ROWS.find((row) => row.key === 'freshness')!
    expect(categoryMax(freshness, { weights: { recency_max: 25 } })).toBe(10)
    expect(categoryMax(freshness, { weights: { recency_max: 6 } })).toBe(6)
  })
})

describe('scoringFrom', () => {
  const custom = { weights: { role: 40 }, penalties: { stale_after_days: 21 } }

  test('reads the scoring section of the scoring_profile meta value', () => {
    expect(scoringFrom(JSON.stringify({ candidate: {}, scoring: custom, scoring_version: 2 }))).toEqual(custom)
    expect(scoringFrom({ scoring: custom })).toEqual(custom)
  })

  test.each([null, undefined, '', 'not json', '[]', JSON.stringify({ scoring: 'x' }), { candidate: {} }])(
    'falls back to score-defaults.json for %j',
    (value) => {
      expect(scoringFrom(value)).toBe(SCORE_DEFAULTS)
    },
  )

  test('drives the maxima and the stale threshold', () => {
    const summary = breakdownRows({ role: 20, stale_offer_penalty: -15 }, scoringFrom({ scoring: custom }))
    expect(summary.rows[0]).toEqual({ key: 'role', points: 20, max: 40 })
    expect(summary.penalties).toEqual([{ key: 'stale_offer_penalty', points: -15, days: 21 }])
  })
})

describe('scoreModel', () => {
  test('lists every category maximum and penalty size for "How the score works"', () => {
    const model = scoreModel()
    const { penalties } = scoreDefaults
    expect(model.categories).toEqual(CATEGORY_ROWS.map((row) => ({ key: row.key, max: categoryMax(row, SCORE_DEFAULTS) })))
    expect(model.penalties).toEqual([
      { key: 'title_automation_penalty', points: -penalties.automation_title },
      { key: 'title_programming_language_penalty', points: -penalties.programming_language_title },
      { key: 'stale_offer_penalty', points: -penalties.stale_offer, days: penalties.stale_after_days },
    ])
  })
})

describe('parseBreakdown', () => {
  test('parses the stored JSON text', () => {
    expect(parseBreakdown('{"role":20,"matched_roles":["qa"]}')).toEqual({ role: 20, matched_roles: ['qa'] })
  })

  test.each([null, undefined, '', '{', '[1,2]', '"text"', 'null'])('treats %j as empty', (raw) => {
    expect(parseBreakdown(raw)).toEqual({})
  })
})
