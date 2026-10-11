import { useCallback, useEffect, useRef, useState } from 'react'
import { loadDashboard, trackingQueue } from '../../lib/offers'
import { loadSeen, saveSeen } from '../../lib/seen'
import type { Dashboard, Offer } from '../../lib/types'

// Data older than this is refreshed when the tab comes back into view (§4.5).
const STALE_MS = 10 * 60_000

export type Load =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  // A refresh keeps the list on screen: no skeleton, and a failure leaves the old data up.
  | { kind: 'ready'; dashboard: Dashboard; refreshing: boolean; refreshError: string | null }

// Supabase errors are plain objects, not Error instances; either way the text is for <details> only.
const detailOf = (error: unknown) => (error as { message?: string } | null)?.message ?? String(error)

const toReview = (offer: Offer) => (offer.application_status ?? 'TO_REVIEW') === 'TO_REVIEW'

// The list's data and every write the list itself makes: the load and refreshes, and the
// silent promotion of an opened offer from To review to Reviewed.
export function useDashboard() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [seen, setSeen] = useState<ReadonlySet<string>>(loadSeen)
  // Mirrors for callbacks that must read the latest value without being recreated.
  const seenRef = useRef(seen)
  const loadedAt = useRef(0)
  const fetching = useRef(false)
  const promoting = useRef(new Set<string>())

  const patch = useCallback((id: string, change: (offer: Offer) => Offer) => {
    setLoad((current) =>
      current.kind === 'ready'
        ? {
            ...current,
            dashboard: {
              ...current.dashboard,
              offers: current.dashboard.offers.map((o) => (o.external_id === id ? change(o) : o)),
            },
          }
        : current,
    )
  }, [])

  const markSeen = useCallback((id: string, on: boolean) => {
    if (seenRef.current.has(id) === on) return
    const next = new Set(seenRef.current)
    if (on) next.add(id)
    else next.delete(id)
    seenRef.current = next
    saveSeen(next)
    setSeen(next)
  }, [])

  // Opening an offer that is still To review marks it Reviewed (§4.5): silently, optimistic,
  // through the queue every write uses. If it can't be saved (offline), it counts as reviewed
  // on this device (joffers-seen) and the write is retried on the next load.
  const promote = useCallback(
    (offer: Offer) => {
      const id = offer.external_id
      if (promoting.current.has(id)) return
      promoting.current.add(id)
      patch(id, (o) => ({ ...o, application_status: 'REVIEW' }))
      const confirmed = { status: 'TO_REVIEW', rate: offer.applied_rate ?? '', notice: offer.notice_period ?? '' } as const
      trackingQueue
        .enqueue(id, { status: 'REVIEW' }, confirmed)
        .then(
          () => markSeen(id, false),
          () => {
            // Back to what is saved, unless a later change (a Save in details) already moved it on.
            patch(id, (o) => (o.application_status === 'REVIEW' ? { ...o, application_status: 'TO_REVIEW' } : o))
            markSeen(id, true)
          },
        )
        .finally(() => promoting.current.delete(id))
    },
    [patch, markSeen],
  )

  const fetchDashboard = useCallback(
    (refresh: boolean) => {
      if (fetching.current) return
      fetching.current = true
      setLoad((current) =>
        refresh && current.kind === 'ready' ? { ...current, refreshing: true, refreshError: null } : { kind: 'loading' },
      )
      loadDashboard()
        .then(
          (loaded) => {
            loadedAt.current = Date.now()
            // A promotion still in flight wins over the copy this load read before it landed.
            const offers = loaded.offers.map((o) =>
              promoting.current.has(o.external_id) && toReview(o) ? { ...o, application_status: 'REVIEW' as const } : o,
            )
            setLoad({ kind: 'ready', dashboard: { ...loaded, offers }, refreshing: false, refreshError: null })
            // Seen here but never saved: retry, or forget the ones saved elsewhere or gone.
            for (const id of seenRef.current) {
              const offer = offers.find((o) => o.external_id === id)
              if (offer && toReview(offer)) promote(offer)
              else if (!promoting.current.has(id)) markSeen(id, false)
            }
          },
          (error: unknown) =>
            setLoad((current) =>
              refresh && current.kind === 'ready'
                ? { ...current, refreshing: false, refreshError: detailOf(error) }
                : { kind: 'error', detail: detailOf(error) },
            ),
        )
        .finally(() => {
          fetching.current = false
        })
    },
    [promote, markSeen],
  )

  useEffect(() => fetchDashboard(false), [fetchDashboard])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || loadedAt.current === 0) return
      if (Date.now() - loadedAt.current > STALE_MS) fetchDashboard(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchDashboard])

  const retry = useCallback(() => fetchDashboard(false), [fetchDashboard])
  const refresh = useCallback(() => fetchDashboard(true), [fetchDashboard])
  // Details report what they saved.
  const replaceOffer = useCallback((updated: Offer) => patch(updated.external_id, () => updated), [patch])

  return { load, seen, retry, refresh, promote, replaceOffer }
}
