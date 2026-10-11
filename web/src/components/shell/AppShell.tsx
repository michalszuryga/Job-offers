import { useCallback, useRef, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { ToastProvider } from '../ui'
import { AppBar } from './AppBar'
import { OfflineBanner } from './OfflineBanner'
import { PageCoverContext } from './pageCover'
import './AppShell.css'

interface Props {
  email: string
  onSignOut: () => void
  children: ReactNode
}

const MAIN_ID = 'offers'

// The signed-in frame (§4.4): skip link, app bar, offline strip, then the page. No bottom nav.
// Toasts (§4.9) sit outside the page, so they stay usable while a view covers it.
export function AppShell({ email, onSignOut, children }: Props) {
  const { t } = useI18n()
  const pageRef = useRef<HTMLDivElement>(null)
  const setCovered = useCallback((covered: boolean) => {
    const page = pageRef.current
    if (!page) return
    page.inert = covered
    if (covered) page.setAttribute('aria-hidden', 'true')
    else page.removeAttribute('aria-hidden')
  }, [])

  return (
    <ToastProvider>
      <PageCoverContext value={setCovered}>
        <div ref={pageRef} className="app-shell">
          <a
            className="skip-link"
            href={`#${MAIN_ID}`}
            onClick={(event) => {
              // Focus without the hash: a #offers history entry would sit between an open
              // offer and the list, and break closing it with back (lib/router.ts).
              event.preventDefault()
              document.getElementById(MAIN_ID)?.focus()
            }}
          >
            {t.shell.skipToOffers}
          </a>
          <AppBar email={email} onSignOut={onSignOut} />
          <OfflineBanner />
          <main id={MAIN_ID} className="app-main" tabIndex={-1}>
            {/* One h1 per view (§5); P6's BatchHeader may take it over. */}
            <h1 className="visually-hidden">{t.shell.heading}</h1>
            {children}
          </main>
        </div>
      </PageCoverContext>
    </ToastProvider>
  )
}
