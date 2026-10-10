import { supabase } from './supabase'
import type { Dashboard, FetchRun, Offer, OfferDetails, Status } from './types'

const LIST_COLUMNS = [
  'external_id', 'title', 'company', 'url', 'source', 'location', 'contract',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period', 'published_at',
  'score', 'application_status', 'applied_rate', 'notice_period', 'applied_at',
].join(',')

export async function isMember(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('app_members').select('user_id').eq('user_id', userId)
  if (error) throw error
  return (data ?? []).length > 0
}

export async function loadDashboard(): Promise<Dashboard> {
  const [offers, meta, runs] = await Promise.all([
    supabase
      .from('jobs')
      .select(LIST_COLUMNS)
      // Hard-rejected offers are kept only so they aren't re-fetched.
      .or('rejected.is.null,rejected.eq.0')
      .order('score', { ascending: false }),
    supabase.from('meta').select('meta_key,meta_value').eq('meta_key', 'last_fetch_new_ids'),
    supabase.from('fetch_runs').select('*').order('started_at', { ascending: false }).limit(1),
  ])
  for (const result of [offers, meta, runs]) {
    if (result.error) throw result.error
  }
  const newIdsValue = meta.data?.[0]?.meta_value
  const run = runs.data?.[0]
  return {
    offers: (offers.data ?? []) as unknown as Offer[],
    newIds: new Set<string>(newIdsValue ? JSON.parse(newIdsValue) : []),
    lastRun: run ? ({ ...run, results: JSON.parse(run.results || '[]') } as FetchRun) : null,
  }
}

export async function loadOfferDetails(externalId: string): Promise<OfferDetails> {
  const { data, error } = await supabase.from('jobs').select('*').eq('external_id', externalId).single()
  if (error) throw error
  return data as OfferDetails
}

export async function saveTracking(externalId: string, status: Status, rate: string, notice: string) {
  const { error } = await supabase.rpc('save_offer_tracking', {
    p_external_id: externalId,
    p_status: status,
    p_rate: rate,
    p_notice: notice,
  })
  if (error) throw error
}
