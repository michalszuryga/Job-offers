import { useState } from 'react'
import { Logo } from '../../components/ui'
import { useI18n } from '../../i18n'
import { SCORE_DEFAULTS } from '../../lib/score'
import { OfferCard } from '../offers/OfferCard'
import { DEMO_NEW_IDS, previewOffers } from '../demo/fixtures'
import './PhoneMock.css'

const SALARY = SCORE_DEFAULTS.salary_bonus ?? {}

// The landing's picture of the app (§4.2): four demo offers as the list draws them, in a
// phone. One image to assistive tech: the wrapper names it, and everything inside is inert
// and hidden, so none of it can be focused or read twice.
export function PhoneMock() {
  const { t } = useI18n()
  // Ages are relative to now on both sides of hydration, so the prerendered "3 h" still
  // matches whenever the page is opened.
  const [offers] = useState(() => previewOffers(Date.now()))
  const fresh = offers.filter((offer) => DEMO_NEW_IDS.has(offer.external_id)).length
  return (
    <div className="phone-mock" role="img" aria-label={t.landing.preview}>
      <div className="phone-mock__device" inert aria-hidden="true">
        <div className="phone-mock__screen">
          <div className="phone-mock__bar">
            <Logo size={24} decorative />
            <span className="phone-mock__avatar">A</span>
          </div>
          <div className="phone-mock__batch">
            <span className="phone-mock__summary">{t.batch.summary(fresh, t.time.hoursAgo(2))}</span>
            <span className="phone-mock__progress">
              <span className="phone-mock__progress-fill" />
            </span>
          </div>
          <ul className="phone-mock__list">
            {offers.map((offer) => (
              <li key={offer.external_id}>
                <OfferCard
                  preview
                  offer={offer}
                  isNew={DEMO_NEW_IDS.has(offer.external_id)}
                  unread={offer.application_status === 'TO_REVIEW'}
                  selected={false}
                  salaryCfg={SALARY}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
