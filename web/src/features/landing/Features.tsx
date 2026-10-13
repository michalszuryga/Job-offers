import { Clock, Gauge, ListChecks, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Link } from 'wouter'
import { Icon } from '../../components/ui'
import { useI18n } from '../../i18n'

const TILES: readonly { key: 'scored' | 'daily' | 'track'; icon: LucideIcon }[] = [
  { key: 'scored', icon: Gauge },
  { key: 'daily', icon: Clock },
  { key: 'track', icon: ListChecks },
]

// Three tiles under the hero (§4.2).
export function Features() {
  const { t } = useI18n()
  const copy = t.landing.features
  return (
    <section className="landing-section" aria-labelledby="features-title">
      <h2 id="features-title" className="visually-hidden">
        {copy.heading}
      </h2>
      <ul className="features">
        {TILES.map(({ key, icon }) => (
          <li key={key} className="feature">
            <span className="feature__icon">
              <Icon icon={icon} size={20} />
            </span>
            <h3 className="feature__title">{copy[key].title}</h3>
            <p className="feature__body">{copy[key].body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

// "No passwords. No ads. No analytics." (§4.2). It must stay true (§8 Q6): any analytics
// added later changes this and /privacy in the same change.
export function PrivacyNote() {
  const { t } = useI18n()
  const copy = t.landing.privacy
  return (
    <section className="landing-section" aria-labelledby="privacy-title">
      <div className="privacy-note">
        <span className="feature__icon">
          <Icon icon={ShieldCheck} size={20} />
        </span>
        <div className="privacy-note__text">
          <h2 id="privacy-title" className="privacy-note__title">
            {copy.heading}
          </h2>
          <p className="privacy-note__line">{copy.line}</p>
          <p className="privacy-note__body">{copy.body}</p>
          <Link href="/privacy" className="privacy-note__link">
            {copy.link}
          </Link>
        </div>
      </div>
    </section>
  )
}
