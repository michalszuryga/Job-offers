import { createContext, useContext } from 'react'
import type { Dashboard, OfferDetails } from './types'
import { createWriteQueue, type SaveTracking, type WriteQueue } from './writeQueue'

// Where the offers screens get their data (plan §3, data change 4): Supabase for members
// (lib/offers.ts supabaseSource, AppRoot only) or the demo's fixtures (features/demo). The
// screens read it from context and never import supabase-js themselves, so /demo can reuse
// them without shipping it.
export interface DataSource {
  loadDashboard(): Promise<Dashboard>
  loadOfferDetails(externalId: string): Promise<OfferDetails>
  // rpc save_offer_tracking for members: overwrites status, rate and notice together.
  saveTracking: SaveTracking
  // Whether the screens remember filters and locally seen offers in localStorage. The demo
  // doesn't, so trying it never changes what a member's own list shows.
  persistent: boolean
}

export const DataSourceContext = createContext<DataSource | null>(null)

export function useDataSource(): DataSource {
  const source = useContext(DataSourceContext)
  if (!source) throw new Error('useDataSource() needs a <DataSourceContext> above it')
  return source
}

// One write queue per source, for the life of the page: every tracking write of that source
// goes through it, serialised per offer (lib/writeQueue.ts).
const queues = new WeakMap<DataSource, WriteQueue>()

export function trackingQueueOf(source: DataSource): WriteQueue {
  let queue = queues.get(source)
  if (!queue) {
    queue = createWriteQueue(source.saveTracking)
    queues.set(source, queue)
  }
  return queue
}
