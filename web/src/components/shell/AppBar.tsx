import { LogIn } from 'lucide-react'
import { Link, useLocation, useSearch } from 'wouter'
import { useI18n } from '../../i18n'
import { useOfferParam } from '../../lib/router'
import { Button, Logo } from '../ui'
import { AccountMenu } from './AccountMenu'
import './AppBar.css'

export interface Account {
  email: string
  onSignOut: () => void
}

// The landing's sign-in card (features/auth/SignInCard.tsx SIGN_IN_ID), which the landing
// brings into view on a hash it is opened with.
const SIGN_IN_HREF = '/#sign-in'

// `account` null: the demo, which has no one to sign out, only a way to sign in.
export function AppBar({ account }: { account: Account | null }) {
  const { t } = useI18n()
  const [path] = useLocation()
  const search = useSearch()
  const { offerId, closeOffer } = useOfferParam()
  const atHome = path === '/' && search === ''

  return (
    <header className="app-bar">
      <Link
        href="/"
        className="app-bar__home"
        // wouter calls this only for a plain click; modified ones open a tab as usual.
        onClick={(event) => {
          // An open offer closes the way Esc and back do (lib/router.ts), so back afterwards
          // doesn't reopen it and the list isn't stacked twice.
          if (offerId != null) {
            event.preventDefault()
            closeOffer()
            return
          }
          // Already on the list: no duplicate history entry, just back to the top.
          if (!atHome) return
          event.preventDefault()
          window.scrollTo({ top: 0 })
        }}
      >
        <Logo />
      </Link>
      {account ? (
        <AccountMenu email={account.email} onSignOut={account.onSignOut} />
      ) : (
        <Link href={SIGN_IN_HREF} asChild>
          <Button href="" variant="secondary" size="sm" icon={LogIn}>
            {t.demo.signIn}
          </Button>
        </Link>
      )}
    </header>
  )
}
