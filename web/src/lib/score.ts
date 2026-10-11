import type { SalaryConfig } from './salary'
// The profile.yaml scoring section; tests/test_web_contract.py keeps it in sync.
import scoreDefaults from './score-defaults.json'

// Score bands (plan §2.3). Fixed product constants that match the Min score presets.
export type ScoreBand = 'top' | 'strong' | 'fair' | 'low' | 'none'

// Lowest score in each band; anything below `fair` is `low`.
export const BAND_THRESHOLDS = { top: 80, strong: 65, fair: 50 } as const

export function scoreBand(score: number | null): ScoreBand {
  if (score == null || Number.isNaN(score)) return 'none'
  // Banded on the rounded value so the colour always agrees with the number shown.
  const value = Math.round(score)
  if (value >= BAND_THRESHOLDS.top) return 'top'
  if (value >= BAND_THRESHOLDS.strong) return 'strong'
  if (value >= BAND_THRESHOLDS.fair) return 'fair'
  return 'low'
}

// score_job() clamps the sum to 0–100 regardless of max_score.
export const SCORE_MAX = 100

export interface ScoringConfig {
  max_score?: number
  weights?: Record<string, number>
  salary_bonus?: SalaryConfig
  penalties?: Record<string, number>
}

export const SCORE_DEFAULTS: ScoringConfig = scoreDefaults

type ConfigPath = readonly [section: 'weights' | 'salary_bonus' | 'penalties', key: string]

// "Why 75?" rows in display order (§4.8). Each maximum is read from the profile at `path`;
// `fallback` is scoring.py's own default for a missing key.
export const CATEGORY_ROWS = [
  { key: 'role', path: ['weights', 'role'], fallback: 0 },
  { key: 'technology', path: ['weights', 'technologies'], fallback: 0 },
  { key: 'domain', path: ['weights', 'domain'], fallback: 0 },
  { key: 'remote', path: ['weights', 'remote'], fallback: 0 },
  { key: 'contract', path: ['weights', 'contract'], fallback: 0 },
  { key: 'seniority', path: ['weights', 'seniority'], fallback: 0 },
  { key: 'language', path: ['weights', 'language'], fallback: 0 },
  { key: 'ai', path: ['weights', 'ai'], fallback: 0 },
  { key: 'freshness', path: ['weights', 'recency_max'], fallback: 10 },
  { key: 'salary_bonus', path: ['salary_bonus', 'points'], fallback: 15 },
] as const satisfies readonly { key: string; path: ConfigPath; fallback: number }[]

export type CategoryKey = (typeof CATEGORY_ROWS)[number]['key']

// Signed values in the breakdown; shown without a bar. `path` is the configured size.
export const PENALTY_ROWS = [
  { key: 'title_automation_penalty', path: ['penalties', 'automation_title'], fallback: 15 },
  { key: 'title_programming_language_penalty', path: ['penalties', 'programming_language_title'], fallback: 30 },
  { key: 'stale_offer_penalty', path: ['penalties', 'stale_offer'], fallback: 15 },
] as const satisfies readonly { key: string; path: ConfigPath; fallback: number }[]

export type PenaltyKey = (typeof PENALTY_ROWS)[number]['key']

export const PENALTY_KEYS: readonly PenaltyKey[] = PENALTY_ROWS.map((row) => row.key)

// recency_points() never returns more than 10, whatever recency_max says.
const FRESHNESS_CEILING = 10

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function configValue(scoring: ScoringConfig, [section, key]: ConfigPath, fallback: number): number {
  const group: unknown = scoring[section]
  const value = isRecord(group) ? group[key] : undefined
  return numeric(value) ? value : fallback
}

export function categoryMax(row: (typeof CATEGORY_ROWS)[number], scoring: ScoringConfig): number {
  const max = configValue(scoring, row.path, row.fallback)
  return row.key === 'freshness' ? Math.min(max, FRESHNESS_CEILING) : max
}

export function staleAfterDays(scoring: ScoringConfig): number {
  return configValue(scoring, ['penalties', 'stale_after_days'], 10)
}

// The `scoring_profile` meta value (JSON text or parsed) → its scoring section.
// Before the first fetch writes it, the bundled profile.yaml defaults stand in.
export function scoringFrom(profile: unknown): ScoringConfig {
  let value = profile
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  const scoring = isRecord(value) ? value.scoring : null
  return isRecord(scoring) ? (scoring as ScoringConfig) : SCORE_DEFAULTS
}

// The model behind the numbers, for "How the score works": every category's maximum and
// every penalty's size. What is filtered out before scoring is copy (t.score.hardExclusions).
export function scoreModel(scoring: ScoringConfig = SCORE_DEFAULTS) {
  return {
    categories: CATEGORY_ROWS.map((row) => ({ key: row.key, max: categoryMax(row, scoring) })),
    penalties: PENALTY_ROWS.map((row) => ({
      key: row.key,
      points: -configValue(scoring, row.path, row.fallback),
      ...(row.key === 'stale_offer_penalty' ? { days: staleAfterDays(scoring) } : {}),
    })),
  }
}

// jobs.score_breakdown as score_job() wrote it: numbers per category plus
// salary_assessment and matched_* lists.
export type Breakdown = Record<string, unknown>

export function parseBreakdown(raw: string | null | undefined): Breakdown {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

export interface BreakdownRow {
  key: CategoryKey
  points: number
  max: number
}

export interface PenaltyRow {
  key: PenaltyKey
  points: number
  // Only for the stale penalty: "Older than N days".
  days?: number
}

export interface BreakdownSummary {
  rows: BreakdownRow[]
  // Categories that scored nothing; folded away under the rows.
  zeroRows: BreakdownRow[]
  penalties: PenaltyRow[]
  rawSum: number
  total: number
  note: 'capped' | 'floored' | null
}

export function breakdownRows(breakdown: Breakdown | null, scoring: ScoringConfig = SCORE_DEFAULTS): BreakdownSummary {
  const values = breakdown ?? {}
  const points = (key: string) => (numeric(values[key]) ? values[key] : 0)
  const all = CATEGORY_ROWS.map((row) => ({ key: row.key, points: points(row.key), max: categoryMax(row, scoring) }))
  const penalties = PENALTY_KEYS.filter((key) => points(key) !== 0).map((key): PenaltyRow => ({
    key,
    points: points(key),
    ...(key === 'stale_offer_penalty' ? { days: staleAfterDays(scoring) } : {}),
  }))
  // Same sum as score_job(): every top-level number, so the total always matches the stored score.
  const rawSum = Object.values(values).filter(numeric).reduce((sum, value) => sum + value, 0)
  const total = Math.max(0, Math.min(SCORE_MAX, rawSum))
  return {
    rows: all.filter((row) => row.points !== 0),
    zeroRows: all.filter((row) => row.points === 0),
    penalties,
    rawSum,
    total,
    note: rawSum > SCORE_MAX ? 'capped' : rawSum < 0 ? 'floored' : null,
  }
}
