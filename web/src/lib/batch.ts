import { isStatus, STATUS_META } from './status'
import type { Offer } from './types'

// The last fetch's batch (§4.5). "New" is one set, newIds ∩ the loaded (visible) offers,
// and it drives the "N new" line, the progress, the tab title and the default view.
export function newOffers<T extends Offer>(offers: readonly T[], newIds: ReadonlySet<string>): T[] {
  return offers.filter((offer) => newIds.has(offer.external_id))
}

// Reviewed: past To review in the database, or opened on this device while that write
// couldn't be saved (lib/seen.ts).
export function isReviewed(offer: Offer, seen: ReadonlySet<string>): boolean {
  return (offer.application_status ?? 'TO_REVIEW') !== 'TO_REVIEW' || seen.has(offer.external_id)
}

export function reviewedCount(batch: readonly Offer[], seen: ReadonlySet<string>): number {
  return batch.filter((offer) => isReviewed(offer, seen)).length
}

// The highest score in the batch; an unscored offer never wins.
export function bestOffer<T extends Offer>(batch: readonly T[]): T | null {
  return batch.reduce<T | null>(
    (best, offer) => (offer.score != null && (best?.score == null || offer.score > best.score) ? offer : best),
    null,
  )
}

// "In progress" on the desktop summary: Preparing and Active statuses.
export function inProgress(offers: readonly Offer[]): { preparing: number; active: number } {
  const count = { preparing: 0, active: 0 }
  for (const offer of offers) {
    const group = isStatus(offer.application_status) ? STATUS_META[offer.application_status].group : null
    if (group === 'preparing' || group === 'active') count[group] += 1
  }
  return count
}

// The scheduled fetch: 18:00 in Warsaw every day (daily-fetch.yml).
export const FETCH_HOUR = 18
export const FETCH_TIME_ZONE = 'Europe/Warsaw'

const warsawHour = new Intl.DateTimeFormat('en-GB', { timeZone: FETCH_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' })

// Whether the next fetch is today in Warsaw ("Next fetch today at 18:00"), else tomorrow.
export function nextFetchToday(now: number = Date.now()): boolean {
  const hour = Number(warsawHour.formatToParts(now).find((part) => part.type === 'hour')?.value)
  return hour < FETCH_HOUR
}
