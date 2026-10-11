import { FETCH_TIME_ZONE } from '../../lib/batch'
import type { Breakdown, BreakdownRow, CategoryKey } from '../../lib/score'
import type { ScoringProfile } from '../../lib/types'

// What the details' match card says beyond the numbers (§4.8). Only the details chunk
// imports this, so none of it weighs on the list's first load.

// The matched_* list score_job() keeps for each category that matches terms.
export const TERM_KEYS = {
  role: 'matched_roles',
  technology: 'matched_technologies',
  domain: 'matched_domains',
  ai: 'matched_ai',
} as const satisfies Partial<Record<CategoryKey, string>>

type TermCategory = keyof typeof TERM_KEYS

const isTermCategory = (key: CategoryKey): key is TermCategory => key in TERM_KEYS

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

// Every matched term once, as stored (score_job() lower-cases them), in category order.
export function matchedTerms(breakdown: Breakdown): string[] {
  return [...new Set(Object.values(TERM_KEYS).flatMap((key) => strings(breakdown[key])))]
}

// The profile's own spelling of each term it matches on, by lower case: "playwright" →
// "Playwright". Terms the profile no longer lists (scored before an edit) keep theirs.
export function candidateCasing(profile: ScoringProfile | null): Map<string, string> {
  const casing = new Map<string, string>()
  const add = (value: unknown): void => {
    if (typeof value === 'string') {
      const key = value.toLowerCase()
      if (!casing.has(key)) casing.set(key, value)
    } else if (Array.isArray(value)) {
      value.forEach(add)
    } else if (isRecord(value)) {
      // technologies: { strong: [...], additional: [...] }
      Object.values(value).forEach(add)
    }
  }
  const candidate = profile?.candidate
  if (isRecord(candidate)) {
    for (const key of ['target_roles', 'technologies', 'domains', 'ai']) add(candidate[key])
  }
  return casing
}

// One part of the "Why" line: a category's matched terms, or none for a category that
// matches no terms (Remote, Contract…), which then reads as its label.
export interface WhyPart {
  key: CategoryKey
  terms: string[]
}

// The "Why" line (§4.8): the top positive categories, those that name matched terms first
// ("Playwright, TypeScript · Remote"), each group by points, ties in breakdown order.
export function whyParts(
  breakdown: Breakdown,
  rows: readonly BreakdownRow[],
  casing: ReadonlyMap<string, string>,
  limit = 2,
): WhyPart[] {
  const byPoints = (a: BreakdownRow, b: BreakdownRow) => b.points - a.points
  const positive = rows.filter((row) => row.points > 0)
  const withTerms = positive
    .filter((row) => isTermCategory(row.key))
    .sort(byPoints)
    .map((row) => ({
      key: row.key,
      terms: strings(breakdown[TERM_KEYS[row.key as TermCategory]]).map((term) => casing.get(term) ?? term),
    }))
    // A term category always matched something when it scored; skip one that says nothing.
    .filter((part) => part.terms.length > 0)
  const plain = positive
    .filter((row) => !isTermCategory(row.key))
    .sort(byPoints)
    .map((row) => ({ key: row.key, terms: [] }))
  return [...withTerms, ...plain].slice(0, limit)
}

// 'YYYY-MM-DD' in Warsaw, where the daily fetch and rescore run.
const warsawDay = new Intl.DateTimeFormat('en-CA', { timeZone: FETCH_TIME_ZONE })

// How recent meta 'scores_refreshed_on' is: 'today', 'yesterday', or null for older (or unreadable).
export function scoresAge(day: string, now: number = Date.now()): 'today' | 'yesterday' | null {
  if (day === warsawDay.format(now)) return 'today'
  if (day === warsawDay.format(now - 86_400_000)) return 'yesterday'
  return null
}

export interface Threshold {
  above: boolean
  threshold: number
}

// breakdown.salary_assessment, when the salary could be compared at all: "Above/Below your
// 15 000 PLN threshold". The threshold is the one the score used, not today's profile.
export function salaryThreshold(breakdown: Breakdown): Threshold | null {
  const assessment = breakdown.salary_assessment
  if (!isRecord(assessment)) return null
  const { estimated_monthly_pln: estimate, threshold_pln: threshold } = assessment
  if (typeof estimate !== 'number' || typeof threshold !== 'number' || !Number.isFinite(estimate)) return null
  return { above: estimate >= threshold, threshold }
}
