import type { MouseEvent } from 'react'
import { Badge, cx, ScoreRing, StatusPill } from '../../components/ui'
import { useI18n } from '../../i18n'
import { formatAgeShort, formatApproxMonthly, formatSalary, timeOf } from '../../lib/format'
import { openOffer, withOffer } from '../../lib/router'
import type { SalaryConfig } from '../../lib/salary'
import type { Offer } from '../../lib/types'
import './OfferCard.css'

interface Props {
  offer: Offer
  // In the last fetch's New set.
  isNew: boolean
  // Still To review, and not opened on this device either.
  unread: boolean
  // Desktop only: the offer open in the pane beside the list.
  selected: boolean
  salaryCfg: SalaryConfig
}

// A plain left click opens in place; with a modifier (or the middle button, which fires no
// click) the browser opens the ?offer= link in a new tab, as any link would.
const plainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

// One offer (§4.5): a real link to its ?offer= URL. The ring sits in column 1, but the title
// comes first in the DOM, so the link's name starts with it.
export function OfferCard({ offer, isNew, unread, selected, salaryCfg }: Props) {
  const { t, lang } = useI18n()
  const status = offer.application_status ?? 'TO_REVIEW'
  const salary = formatSalary(offer, lang)
  const approx = salary ? formatApproxMonthly(offer, lang, salaryCfg) : null
  const meta = [offer.company, offer.location, offer.contract, offer.source].filter(Boolean).join(' · ')

  return (
    <a
      className={cx('offer', unread && 'offer--unread', selected && 'offer--selected')}
      href={withOffer(location.href, offer.external_id)}
      // Closing the details finds the card again by this, to hand focus back (OffersPage).
      data-offer={offer.external_id}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        if (!plainClick(event)) return
        event.preventDefault()
        openOffer(offer.external_id)
      }}
    >
      <span className="offer__head">
        {/* Unread shows as weight plus a dot drawn by ::before; the text itself never changes. */}
        <span className="offer-title">{offer.title}</span>
        {timeOf(offer.published_at) != null && (
          <span className="offer__age">{formatAgeShort(offer.published_at, lang)}</span>
        )}
      </span>
      <ScoreRing score={offer.score} className="offer__ring" />
      {meta && <span className="offer__meta">{meta}</span>}
      <span className="offer__foot">
        <span className="offer__salary">
          {salary ? <span className="offer__amount">{salary}</span> : <span className="offer__none">{t.salary.notListed}</span>}
          {approx && <span className="offer__approx">{approx}</span>}
        </span>
        {status !== 'TO_REVIEW' ? (
          <StatusPill status={status} className="offer__status" />
        ) : (
          isNew && (
            <Badge tone="new" className="offer__status">
              {t.offers.newBadge}
            </Badge>
          )
        )}
      </span>
    </a>
  )
}
