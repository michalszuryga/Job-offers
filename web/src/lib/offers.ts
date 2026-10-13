import type { DataSource } from './dataSource'
import { sortOffers } from './format'
import { supabase } from './supabase'
import type { Dashboard, FetchRun, Offer, OfferDetails, ScoringProfile } from './types'
import type { Tracking } from './writeQueue'

// Pulls in supabase-js: import only from the AppRoot chunk, never from the entry, a public
// page or the demo (features/auth/AppRoot.tsx, check-bundle). The offers screens get these
// through lib/dataSource.ts.

// score_breakdown stays out: it is only needed in details, which load it per offer.
const LIST_COLUMNS = [
  'external_id', 'title', 'company', 'url', 'source', 'location', 'contract',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period', 'published_at',
  'score', 'application_status', 'applied_rate', 'notice_period', 'applied_at',
].join(',')

// One request, best scores first; the page says so when there are more (plan §3).
export const LIST_LIMIT = 2000

const META_KEYS = ['last_fetch_new_ids', 'scoring_profile', 'scores_refreshed_on']

// Meta and run results are JSON text written by the Python side; a bad value
// degrades to "nothing recorded" instead of failing the whole page.
function parseJson(text: string | null | undefined): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export async function isMember(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('app_members').select('user_id').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).length > 0
}

async function loadDashboard(): Promise<Dashboard> {
  const [offers, meta, runs] = await Promise.all([
    supabase
      .from('jobs')
      .select(LIST_COLUMNS, { count: 'exact' })
      // Hard-rejected offers are kept only so they aren't re-fetched.
      .or('rejected.is.null,rejected.eq.0')
      // Postgres puts NULLs first in a descending sort; unscored offers shouldn't take the limited slots.
      .order('score', { ascending: false, nullsFirst: false })
      .range(0, LIST_LIMIT - 1),
    supabase.from('meta').select('meta_key,meta_value').in('meta_key', META_KEYS),
    supabase.from('fetch_runs').select('*').order('started_at', { ascending: false }).limit(1),
  ])
  for (const result of [offers, meta, runs]) {
    if (result.error) throw result.error
  }
  const metaValue = (key: string): string | null =>
    meta.data?.find((row) => row.meta_key === key)?.meta_value ?? null
  const newIds = parseJson(metaValue('last_fetch_new_ids'))
  const profile = parseJson(metaValue('scoring_profile'))
  const scoringProfile = isRecord(profile) ? (profile as ScoringProfile) : null
  const run = runs.data?.[0]
  const results = parseJson(run?.results)
  const rows = (offers.data ?? []) as unknown as Offer[]
  return {
    // Sorted here too: same order as the server, and unscored offers last whatever the backend does.
    offers: sortOffers(rows, 'score'),
    total: offers.count ?? rows.length,
    newIds: new Set<string>(Array.isArray(newIds) ? newIds.filter((id) => typeof id === 'string') : []),
    lastRun: run ? ({ ...run, results: Array.isArray(results) ? results : [] } as FetchRun) : null,
    scoringProfile,
    scoresRefreshedOn: metaValue('scores_refreshed_on'),
  }
}

async function loadOfferDetails(externalId: string): Promise<OfferDetails> {
  const { data, error } = await supabase.from('jobs').select('*').eq('external_id', externalId).single()
  if (error) throw error
  return data as OfferDetails
}

// The only write (plan header): rpc save_offer_tracking, which overwrites all three fields.
async function saveTracking(externalId: string, { status, rate, notice }: Tracking) {
  const { error } = await supabase.rpc('save_offer_tracking', {
    p_external_id: externalId,
    p_status: status,
    p_rate: rate,
    p_notice: notice,
  })
  if (error) throw error
}

// The members' data, provided by AppRoot.
export const supabaseSource: DataSource = { loadDashboard, loadOfferDetails, saveTracking, persistent: true }
