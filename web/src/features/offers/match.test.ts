import { describe, expect, test } from 'vitest'
import fixture from '../../lib/__fixtures__/breakdown.json'
import { breakdownRows } from '../../lib/score'
import { candidateCasing, matchedTerms, salaryThreshold, scoresAge, whyParts } from './match'

const PROFILE = {
  candidate: {
    target_roles: ['QA Engineer', 'Test Engineer'],
    technologies: { strong: ['Playwright', 'TypeScript', 'SQL'], additional: ['DBeaver'] },
    domains: ['healthcare', 'SaaS'],
    ai: ['Claude Code'],
  },
}

// The e2e mock's stand-in breakdown: Role scores without a matched role.
const MOCK = {
  role: 20, technology: 10, domain: 0, remote: 15, contract: 10, seniority: 0, language: 0, ai: 0, freshness: 5,
  title_automation_penalty: 0, title_programming_language_penalty: 0, stale_offer_penalty: 0, salary_bonus: 0,
  salary_assessment: { estimated_monthly_pln: 20000, threshold_pln: 15000, minimum_of_range_used: true },
  matched_roles: [], matched_technologies: ['playwright', 'typescript'], matched_domains: [], matched_ai: [],
}

describe('candidateCasing', () => {
  test('maps every list, technology groups included, back to the profile spelling', () => {
    const casing = candidateCasing(PROFILE)
    expect(casing.get('typescript')).toBe('TypeScript')
    expect(casing.get('dbeaver')).toBe('DBeaver')
    expect(casing.get('saas')).toBe('SaaS')
    expect(casing.get('claude code')).toBe('Claude Code')
    expect(casing.get('qa engineer')).toBe('QA Engineer')
  })

  test('is empty without a profile', () => {
    expect(candidateCasing(null).size).toBe(0)
  })
})

describe('matchedTerms', () => {
  test('every matched term once, as stored', () => {
    expect(matchedTerms(MOCK)).toEqual(['playwright', 'typescript'])
    expect(matchedTerms({ matched_roles: ['qa engineer'], matched_technologies: ['sql', 'qa engineer'] }))
      .toEqual(['qa engineer', 'sql'])
    expect(matchedTerms({})).toEqual([])
  })
})

describe('whyParts', () => {
  test('categories with matched terms first, in the profile spelling, then the rest by points', () => {
    const rows = breakdownRows(MOCK).rows
    expect(whyParts(MOCK, rows, candidateCasing(PROFILE))).toEqual([
      { key: 'technology', terms: ['Playwright', 'TypeScript'] },
      { key: 'remote', terms: [] },
    ])
  })

  test('a real score_job() breakdown', () => {
    const breakdown = fixture.cases[0].breakdown
    const parts = whyParts(breakdown, breakdownRows(breakdown).rows, candidateCasing(PROFILE), 3)
    expect(parts.map((part) => part.key)).toEqual(['technology', 'role', 'domain'])
    // A term the profile no longer lists keeps the stored spelling.
    expect(parts[0].terms).toContain('Playwright')
  })

  test('nothing positive, nothing to say', () => {
    expect(whyParts({ role: 0 }, breakdownRows({ role: 0 }).rows, new Map())).toEqual([])
  })
})

describe('scoresAge', () => {
  // 10:00 in Warsaw on 8 October.
  const NOW = Date.parse('2026-10-08T10:00:00+02:00')

  test('today and yesterday by the Warsaw calendar', () => {
    expect(scoresAge('2026-10-08', NOW)).toBe('today')
    expect(scoresAge('2026-10-07', NOW)).toBe('yesterday')
    expect(scoresAge('2026-10-01', NOW)).toBeNull()
    // 00:30 in Warsaw is still the previous day in UTC.
    expect(scoresAge('2026-10-09', Date.parse('2026-10-09T00:30:00+02:00'))).toBe('today')
  })
})

describe('salaryThreshold', () => {
  test('compares the estimate with the threshold the score used', () => {
    expect(salaryThreshold(MOCK)).toEqual({ above: true, threshold: 15000 })
    expect(salaryThreshold(fixture.cases[0].breakdown)).toEqual({ above: false, threshold: 15000 })
  })

  test('says nothing without an estimate', () => {
    expect(salaryThreshold({ salary_assessment: { estimated_monthly_pln: null, threshold_pln: 15000 } })).toBeNull()
    expect(salaryThreshold({})).toBeNull()
  })
})
