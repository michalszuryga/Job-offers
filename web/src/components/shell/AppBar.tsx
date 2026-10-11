import { Link, useLocation, useSearch } from 'wouter'
import { useOfferParam } from '../../lib/router'
import { Logo } from '../ui'
import { AccountMenu } from './AccountMenu'
import './AppBar.css'

interface Props {
  email: string
  onSignOut: () => void
}

export function AppBar({ email, onSignOut }: Props) {
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
      <AccountMenu email={email} onSignOut={onSignOut} />
    </header>
  )
}
