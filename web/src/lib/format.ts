import { formatNumber, type Lang } from '../i18n/intl'
import { MESSAGES } from '../i18n/messages'
import type { Filters, PublishedWindow, SortKey } from './prefs'
import { isPlnPerMonth, monthlySalaryPln, salaryPeriod, type SalaryConfig, type SalaryFields } from './salary'
import type { Offer } from './types'

export { formatNumber }
export type { SortKey }

const WINDOW_HOURS: Record<Exclude<PublishedWindow, 'new' | 'any'>, number> = { '24h': 24, '3d': 72, '7d': 168 }

interface FilterContext {
  now?: number
  // The last fetch's new ids: the New window shows exactly those, whatever their dates say.
  newIds?: ReadonlySet<string>
}

const NONE: ReadonlySet<string> = new Set()

// Narrows only; the order is sortOffers' job.
export function applyFilters(offers: readonly Offer[], filters: Filters, { now = Date.now(), newIds = NONE }: FilterContext = {}): Offer[] {
  const query = filters.query.trim().toLowerCase()
  return offers.filter((offer) => {
    if ((offer.score ?? 0) < filters.minScore) return false
    if (filters.status !== 'ALL' && (offer.application_status ?? 'TO_REVIEW') !== filters.status) return false
    if (filters.source !== 'ALL' && offer.source !== filters.source) return false
    if (query && !`${offer.title ?? ''} ${offer.company ?? ''}`.toLowerCase().includes(query)) return false
    if (filters.window === 'new') return newIds.has(offer.external_id)
    if (filters.window !== 'any') {
      // No reliable date means we can't say it's recent, so it's hidden here.
      const published = publishedTime(offer)
      if (published == null || now - published > WINDOW_HOURS[filters.window] * 3_600_000) return false
    }
    return true
  })
}

// "20 000–25 000 PLN/month"; empty when no amount is listed.
export function formatSalary(offer: SalaryFields, lang: Lang): string {
  const values = [offer.salary_min, offer.salary_max].filter((v): v is number => v != null)
  if (values.length === 0) return ''
  const amounts = [...new Set(values.map((v) => formatNumber(v, lang)))].join('–')
  const period = salaryPeriod(offer.salary_period)
  const suffix = `${offer.salary_currency ?? ''}${period ? MESSAGES[lang].salary.periods[period] : ''}`
  return suffix ? `${amounts} ${suffix}` : amounts
}

// "≈ 28 160 PLN/month", or null when the offer is already PLN/month or can't be converted.
export function formatApproxMonthly(offer: SalaryFields, lang: Lang, salaryCfg: SalaryConfig = {}): string | null {
  if (isPlnPerMonth(offer)) return null
  const monthly = monthlySalaryPln(offer, salaryCfg)
  return monthly == null ? null : MESSAGES[lang].salary.approxMonthly(formatNumber(monthly, lang))
}

// Breakdown points with their sign: "+20", "−15" (a real minus), "0". Halves survive rounding.
export function formatPoints(points: number, lang: Lang): string {
  const text = formatNumber(Math.abs(points), lang, 1)
  return points > 0 ? `+${text}` : points < 0 ? `\u2212${text}` : text
}

// Milliseconds since the epoch, or null for a missing or unparseable date. Callers
// branch on null before building a sentence around formatAgo's stand-alone fallback.
export function timeOf(iso: string | null | undefined): number | null {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isNaN(time) ? null : time
}

type Age = { unit: 'now' | 'minutes' | 'hours' | 'days'; n: number }

function age(iso: string | null, now: number): Age | null {
  const then = timeOf(iso)
  if (then == null) return null
  const minutes = Math.max(0, Math.round((now - then) / 60_000))
  if (minutes < 1) return { unit: 'now', n: 0 }
  if (minutes < 60) return { unit: 'minutes', n: minutes }
  if (minutes < 48 * 60) return { unit: 'hours', n: Math.round(minutes / 60) }
  return { unit: 'days', n: Math.round(minutes / (24 * 60)) }
}

// "3 h ago" / "3 godz. temu".
export function formatAgo(iso: string | null, lang: Lang, now = Date.now()): string {
  const time = MESSAGES[lang].time
  const value = age(iso, now)
  if (!value) return time.unknown
  switch (value.unit) {
    case 'now': return time.justNow
    case 'minutes': return time.minutesAgo(value.n)
    case 'hours': return time.hoursAgo(value.n)
    case 'days': return time.daysAgo(value.n)
  }
}

// "3 h" / "3 godz.", for tight spots like the card's age.
export function formatAgeShort(iso: string | null, lang: Lang, now = Date.now()): string {
  const time = MESSAGES[lang].time
  const value = age(iso, now)
  if (!value) return time.unknown
  switch (value.unit) {
    case 'now': return time.now
    case 'minutes': return time.minutes(value.n)
    case 'hours': return time.hours(value.n)
    case 'days': return time.days(value.n)
  }
}

function publishedTime(offer: Pick<Offer, 'published_at'>): number | null {
  return timeOf(offer.published_at)
}

// Descending, with missing values last whichever way the rest sorts.
function descending(a: number | null, b: number | null): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  return b - a
}

const score = (offer: Offer) => (offer.score != null && Number.isFinite(offer.score) ? offer.score : null)

// Client-side order: unscored, undated or unconvertible offers go last. Ties fall back to
// score (or recency for the score sort) and then keep the server order (the sort is stable).
export function sortOffers<T extends Offer>(offers: readonly T[], sort: SortKey, salaryCfg: SalaryConfig = {}): T[] {
  const primary =
    sort === 'newest' ? publishedTime : sort === 'salary' ? (offer: T) => monthlySalaryPln(offer, salaryCfg) : score
  const secondary = sort === 'score' ? publishedTime : score
  return offers
    .map((offer) => ({ offer, primary: primary(offer), secondary: secondary(offer) }))
    .sort((a, b) => descending(a.primary, b.primary) || descending(a.secondary, b.secondary))
    .map(({ offer }) => offer)
}
