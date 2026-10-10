import type { Offer, Status } from './types'

export type PublishedWindow = 'any' | '24h' | '3d' | '7d'

export const WINDOW_LABELS: Record<PublishedWindow, string> = {
  any: 'Any time',
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
}

const WINDOW_HOURS: Record<Exclude<PublishedWindow, 'any'>, number> = { '24h': 24, '3d': 72, '7d': 168 }

export interface Filters {
  window: PublishedWindow
  minScore: number
  status: Status | 'ALL'
  source: string
  query: string
}

export const DEFAULT_FILTERS: Filters = { window: '24h', minScore: 0, status: 'ALL', source: 'ALL', query: '' }

export function applyFilters(offers: Offer[], filters: Filters, now = Date.now()): Offer[] {
  const query = filters.query.trim().toLowerCase()
  return offers.filter((offer) => {
    if ((offer.score ?? 0) < filters.minScore) return false
    if (filters.status !== 'ALL' && (offer.application_status ?? 'TO_REVIEW') !== filters.status) return false
    if (filters.source !== 'ALL' && offer.source !== filters.source) return false
    if (query && !`${offer.title ?? ''} ${offer.company ?? ''}`.toLowerCase().includes(query)) return false
    if (filters.window !== 'any') {
      // No reliable date means we can't say it's recent, so it's hidden here.
      const published = offer.published_at ? Date.parse(offer.published_at) : NaN
      if (Number.isNaN(published) || now - published > WINDOW_HOURS[filters.window] * 3_600_000) return false
    }
    return true
  })
}

const PERIODS: Record<string, string> = { hour: '/h', month: '/month', year: '/year', day: '/day' }

export function formatSalary(offer: Pick<Offer, 'salary_min' | 'salary_max' | 'salary_currency' | 'salary_period'>): string {
  const values = [...new Set([offer.salary_min, offer.salary_max])].filter((v): v is number => v != null)
  if (values.length === 0) return ''
  const amounts = values.map((v) => Math.round(v).toLocaleString('pl-PL')).join('–')
  return `${amounts} ${offer.salary_currency ?? ''}${PERIODS[(offer.salary_period ?? '').toLowerCase()] ?? ''}`.trim()
}

export function formatAge(iso: string | null, now = Date.now()): string {
  if (!iso) return 'date unknown'
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 'date unknown'
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`
  return `${Math.round(minutes / (24 * 60))} days ago`
}
