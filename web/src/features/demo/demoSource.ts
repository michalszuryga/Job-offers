import type { DataSource } from '../../lib/dataSource'
import type { Offer } from '../../lib/types'
import type { Tracking } from '../../lib/writeQueue'
import { demoDashboard, demoDetails } from './fixtures'

// /demo's data (§4.11): the fixtures, with every save kept in memory for this page load.
// Nothing here talks to the network, so the demo makes no Supabase request at all.

// A short wait, so loading states and the write queue behave as they do against Supabase.
const LATENCY_MS = 120
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS))

export function createDemoSource(now: () => number = Date.now): DataSource {
  const dashboard = demoDashboard(now())
  // Saved tracking per offer, applied over the fixtures on every load.
  const saved = new Map<string, Tracking & { appliedAt: string | null }>()

  const withSaves = (offer: Offer): Offer => {
    const tracking = saved.get(offer.external_id)
    if (!tracking) return offer
    return {
      ...offer,
      application_status: tracking.status,
      applied_rate: tracking.rate,
      notice_period: tracking.notice,
      applied_at: tracking.appliedAt,
    }
  }
  const find = (id: string) => dashboard.offers.find((offer) => offer.external_id === id)

  return {
    persistent: false,
    async loadDashboard() {
      await settle()
      return { ...dashboard, offers: dashboard.offers.map(withSaves), newIds: new Set(dashboard.newIds) }
    },
    async loadOfferDetails(id) {
      await settle()
      const offer = find(id)
      const details = offer && demoDetails(withSaves(offer))
      if (!details) throw new Error(`No demo offer ${id}`)
      return details
    },
    // Like save_offer_tracking: all three fields at once, and applied_at set the first time
    // an offer is marked Applied (Undo keeps it).
    async saveTracking(id, tracking) {
      await settle()
      const offer = find(id)
      if (!offer) throw new Error(`No demo offer ${id}`)
      const before = withSaves(offer).applied_at
      const appliedAt = before ?? (tracking.status === 'APPLIED' ? new Date(now()).toISOString() : null)
      saved.set(id, { ...tracking, appliedAt })
    },
  }
}

// One per page load: what the demo saved survives leaving it and coming back, not a reload.
export const demoSource = createDemoSource()
