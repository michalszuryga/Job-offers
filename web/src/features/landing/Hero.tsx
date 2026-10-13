import { lazy, Suspense } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'wouter'
import { Button } from '../../components/ui'
import { useI18n } from '../../i18n'
import type { SignInNotice } from '../auth/SignInCard'

// Own chunks, outside the landing's first-load budget (check-bundle): the members' sign-in
// (forms, auth errors) and the preview, which is decoration and carries the demo fixtures.
// In the prerendered page their markup is already there; each hydrates when it lands.
const SignInCard = lazy(() => import('../auth/SignInCard').then((m) => ({ default: m.SignInCard })))
const PhoneMock = lazy(() => import('./PhoneMock').then((m) => ({ default: m.PhoneMock })))

interface Props {
  notice: SignInNotice | null
  onSignedIn?: () => void
}

// §4.2: demo first, then the members' sign-in; the phone preview beside them from 1024 px.
export function Hero({ notice, onSignedIn }: Props) {
  const { t } = useI18n()
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        {/* A small-caps kicker over the headline, as an editorial page would (visual refresh). */}
        <p className="hero__kicker">{t.landing.badge}</p>
        <h1 id="hero-title" className="hero__title">
          {t.landing.title}
        </h1>
        <p className="hero__lead">{t.landing.lead}</p>
        <div className="hero__cta">
          {/* asChild: wouter's client-side navigation on the kit's link-styled Button. */}
          <Link href="/demo" asChild>
            <Button href="" trailingIcon={ArrowRight} className="hero__demo">
              {t.landing.tryDemo}
            </Button>
          </Link>
          <p className="hero__note">{t.landing.demoNote}</p>
        </div>
        <Suspense fallback={<div className="sign-in sign-in--pending" />}>
          <SignInCard notice={notice} onSignedIn={onSignedIn} />
        </Suspense>
      </div>
      <div className="hero__preview">
        <Suspense fallback={<div className="phone-mock phone-mock--pending" />}>
          <PhoneMock />
        </Suspense>
      </div>
    </section>
  )
}
