import type { ScoringConfig } from './score'

// Must match DEFAULT_STATUSES in job_finder/storage.py and save_offer_tracking() in db/web_access.sql.
export const STATUSES = [
  'TO_REVIEW',
  'REVIEW',
  'INTERESTED',
  'CV_GENERATED',
  'READY_TO_APPLY',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'WITHDRAWN',
] as const

export type Status = (typeof STATUSES)[number]

export interface Offer {
  external_id: string
  title: string | null
  company: string | null
  url: string
  source: string | null
  location: string | null
  contract: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  published_at: string | null
  score: number | null
  application_status: Status | null
  applied_rate: string | null
  notice_period: string | null
  applied_at: string | null
}

export interface OfferDetails extends Offer {
  description: string | null
  score_breakdown: string | null
  matched_keywords: string | null
}

// One source in fetch_runs.results. The counts are missing from runs recorded before they existed.
export interface SourceRun {
  name: string
  candidates?: number
  inserted?: number
  rejected?: number
  expired?: number
  seconds?: number
  error: string
  error_type: string
}

export interface FetchRun {
  started_at: string
  finished_at: string
  trigger: string
  results: SourceRun[]
}

// meta 'scoring_profile', written by every fetch: everything that can change a score
// (job_finder/rescore.py scoring_inputs). Only `scoring` is read so far.
export interface ScoringProfile {
  candidate?: Record<string, unknown>
  scoring?: ScoringConfig
  filters?: Record<string, unknown>
  hard_exclusions?: Record<string, unknown>
  scoring_version?: number
}

export interface Dashboard {
  offers: Offer[]
  // Visible offers in the database; more than offers.length when the list query hit its limit.
  total: number
  newIds: Set<string>
  lastRun: FetchRun | null
  // Null until the first fetch that records it; score.ts then falls back to score-defaults.json.
  scoringProfile: ScoringProfile | null
  // 'YYYY-MM-DD' of the last rescore.
  scoresRefreshedOn: string | null
}
