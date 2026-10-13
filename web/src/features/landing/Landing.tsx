import { Languages } from 'lucide-react'
import { Link } from 'wouter'
import { Button, Logo } from '../../components/ui'
import { LANG_NAMES, useI18n } from '../../i18n'
import type { SignInNotice } from '../auth/SignInCard'
import { HOW_IT_WORKS_ID, SIGN_IN_ID } from './anchors'
import { Features, PrivacyNote } from './Features'
import { Footer, GITHUB_URL } from './Footer'
import { Hero } from './Hero'
import { HowScoreWorks } from './HowScoreWorks'
import './Landing.css'

interface Props {
  // An expired link or session (§4.10), shown on the sign-in card.
  notice?: SignInNotice | null
  // A code signed in on the card (App.tsx then switches to the app).
  onSignedIn?: () => void
}

// The sign-in card, focused once in view: keyboard and screen-reader users land on it, not
// just their scroll position. The anchor itself works before hydration too.
function focusSignIn() {
  requestAnimationFrame(() => document.getElementById(SIGN_IN_ID)?.focus({ preventScroll: true }))
}

function Nav() {
  const { t, lang, setLang } = useI18n()
  const other = lang === 'en' ? 'pl' : 'en'
  return (
    <header className="landing-nav">
      <div className="landing-nav__inner">
        <a href="#top" className="landing-nav__home" aria-label={t.landing.home}>
          <Logo decorative />
        </a>
        <nav aria-label={t.landing.nav} className="landing-nav__links">
          <a href={`#${HOW_IT_WORKS_ID}`} className="landing-nav__link landing-nav__link--wide">
            {t.landing.howItWorks}
          </a>
          <Link href="/demo" className="landing-nav__link landing-nav__link--wide">
            {t.landing.demo}
          </Link>
          <a href={GITHUB_URL} className="landing-nav__link landing-nav__link--wide">
            GitHub
          </a>
        </nav>
        <div className="landing-nav__actions">
          <button type="button" className="landing-nav__lang" lang={other} onClick={() => setLang(other)}>
            <Languages aria-hidden="true" size={16} strokeWidth={1.75} />
            {LANG_NAMES[other]}
          </button>
          <Button href={`#${SIGN_IN_ID}`} variant="secondary" size="sm" onClick={focusSignIn}>
            {t.landing.signIn}
          </Button>
        </div>
      </div>
    </header>
  )
}

// The signed-out home page (§4.2), prerendered in English into index.html (postbuild.mjs).
// .landing-static: the head script hides it for members, whose app boots there instead.
export function Landing({ notice = null, onSignedIn }: Props) {
  return (
    <div id="top" className="landing landing-static">
      <Nav />
      <main className="landing__main">
        <Hero notice={notice} onSignedIn={onSignedIn} />
        <Features />
        <HowScoreWorks />
        <PrivacyNote />
      </main>
      <Footer />
    </div>
  )
}
