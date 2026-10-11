import type { Status } from './types'

export interface Tracking {
  status: Status
  rate: string
  notice: string
}

// Calls rpc save_offer_tracking, which overwrites all three fields at once.
export type SaveTracking = (id: string, tracking: Tracking) => Promise<void>

export interface WriteQueue {
  // `confirmed` is what the caller last saw saved; it seeds the offer's lane when nothing is
  // in flight. Resolves with the newly confirmed tracking. Rejects on failure, leaving the
  // confirmed state as it was, so the caller rolls back its optimistic update.
  enqueue(id: string, change: Partial<Tracking>, confirmed: Tracking): Promise<Tracking>
}

interface Lane {
  tail: Promise<void>
  pending: number
  confirmed: Tracking
}

export function createWriteQueue(save: SaveTracking): WriteQueue {
  const lanes = new Map<string, Lane>()

  return {
    enqueue(id, change, confirmed) {
      let lane = lanes.get(id)
      if (!lane) {
        lane = { tail: Promise.resolve(), pending: 0, confirmed }
        lanes.set(id, lane)
      }
      const current = lane
      current.pending += 1
      const defined = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== undefined))

      // Built when its turn comes, not now: a write queued behind a Save must keep
      // the rate that Save confirms, or the RPC would overwrite it with the old one.
      const run = current.tail.then(async () => {
        const request: Tracking = { ...current.confirmed, ...defined }
        await save(id, request)
        current.confirmed = request
        return request
      })

      current.tail = run.then(
        () => undefined,
        () => undefined,
      ).then(() => {
        current.pending -= 1
        // An idle lane is dropped, so the next write starts from the caller's (possibly reloaded) state.
        if (current.pending === 0 && lanes.get(id) === current) lanes.delete(id)
      })
      return run
    },
  }
}

// The fields of `edited` that differ from `base`: what a form actually changed. Sending only
// these lets the queue merge them onto whatever was confirmed last.
export function changedFields(edited: Tracking, base: Tracking): Partial<Tracking> {
  const change: Partial<Tracking> = {}
  if (edited.status !== base.status) change.status = edited.status
  if (edited.rate !== base.rate) change.rate = edited.rate
  if (edited.notice !== base.notice) change.notice = edited.notice
  return change
}
