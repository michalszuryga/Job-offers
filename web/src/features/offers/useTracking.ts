import { useCallback } from 'react'
import { useToast } from '../../components/ui'
import { useI18n } from '../../i18n'
import { trackingQueue } from '../../lib/offers'
import type { Offer, Status } from '../../lib/types'
import type { Tracking } from '../../lib/writeQueue'

// The list's offers (useDashboard): changed optimistically, read back when a write settles.
export type UpdateOffer = (id: string, change: (offer: Offer) => Offer) => void
export type GetOffer = (id: string) => Offer | null

export interface Notes {
  rate?: string
  notice?: string
}

// The status each offer was last asked to take, so a failed write rolls back (and says so)
// only while nothing newer was asked for. Module-wide: an Undo can outlive the details.
const requested = new Map<string, Status>()

const trackingOf = (offer: Offer): Tracking => ({
  status: offer.application_status ?? 'TO_REVIEW',
  rate: offer.applied_rate ?? '',
  notice: offer.notice_period ?? '',
})

// Every tracking write the details make, through the one queue (lib/offers trackingQueue).
// Each touches only its own fields in the list, so a Save landing after a status change
// can't put the old status back (and the other way round).
export function useTracking(getOffer: GetOffer, updateOffer: UpdateOffer) {
  const { t } = useI18n()
  const toast = useToast()

  // §4.9: optimistic, queued, then "Status: Applied · Undo" for 6 s. Undo writes the previous
  // status back (applied_at stays: it records the first time). A failure rolls back, unless a
  // later change already moved on, and offers Retry. Never moves to another offer.
  const changeStatus = useCallback(
    (id: string, next: Status) => {
      const change = (to: Status, undoable: boolean) => {
        const offer = getOffer(id)
        if (!offer) return
        // Seeds the offer's lane only when nothing is in flight, and then it is what's saved.
        const confirmed = trackingOf(offer)
        const previous = confirmed.status
        if (to === previous) return
        requested.set(id, to)
        updateOffer(id, (o) => ({ ...o, application_status: to }))
        toast.show({
          message: t.toast.status(t.status[to]),
          ...(undoable ? { actionLabel: t.common.undo, onAction: () => change(previous, false) } : {}),
        })
        trackingQueue.enqueue(id, { status: to }, confirmed).catch(() => {
          if (requested.get(id) !== to) return
          requested.set(id, previous)
          updateOffer(id, (o) => (o.application_status === to ? { ...o, application_status: previous } : o))
          toast.show({ message: t.toast.statusFailed, actionLabel: t.common.retry, onAction: () => change(to, undoable) })
        })
      }
      change(next, true)
    },
    [getOffer, updateOffer, toast, t],
  )

  // The tracking form's Save: only the fields it changed, merged by the queue onto whatever
  // was confirmed last. Rejects on failure; the form says so and offers Retry.
  const saveNotes = useCallback(
    async (id: string, notes: Notes) => {
      const offer = getOffer(id)
      if (!offer) throw new Error('offer not loaded')
      const saved = await trackingQueue.enqueue(id, notes, trackingOf(offer))
      updateOffer(id, (o) => ({ ...o, applied_rate: saved.rate, notice_period: saved.notice }))
    },
    [getOffer, updateOffer],
  )

  return { changeStatus, saveNotes }
}
