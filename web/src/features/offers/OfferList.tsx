import { isReviewed } from '../../lib/batch'
import type { SalaryConfig } from '../../lib/salary'
import type { Offer } from '../../lib/types'
import { OfferCard } from './OfferCard'
import './OfferList.css'

interface Props {
  offers: readonly Offer[]
  newIds: ReadonlySet<string>
  // Offers opened on this device whose Reviewed write hasn't been saved yet.
  seen: ReadonlySet<string>
  // Desktop: the offer open in the pane, marked on its card. Null on phones.
  selectedId: string | null
  salaryCfg: SalaryConfig
}

// .offers is an e2e hook: keep it.
export function OfferList({ offers, newIds, seen, selectedId, salaryCfg }: Props) {
  return (
    <ul className="offers">
      {offers.map((offer) => (
        <li key={offer.external_id}>
          <OfferCard
            offer={offer}
            isNew={newIds.has(offer.external_id)}
            unread={!isReviewed(offer, seen)}
            selected={offer.external_id === selectedId}
            salaryCfg={salaryCfg}
          />
        </li>
      ))}
    </ul>
  )
}
