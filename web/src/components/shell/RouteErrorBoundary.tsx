import { Component, useEffect, useState, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button, Callout, Logo } from '../ui'
import { useI18n } from '../../i18n'
import './RouteErrorBoundary.css'

// What the boundary shows. A function component, so it can use the i18n hook.
function LoadFailed() {
  const { t } = useI18n()
  // Into the status region one frame after it is on screen: a region inserted together with
  // its text may go unannounced.
  const [announce, setAnnounce] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnnounce(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <main className="route-error">
      <Logo />
      <h1 className="visually-hidden">JOffers</h1>
      <div role="status" className="route-error__status">
        {announce && (
          <Callout
            tone="danger"
            title={t.boot.failed}
            actions={
              // A full load: lazy() keeps a failed import, and a tab older than the last
              // deploy needs the new index.html to find the chunks at all.
              <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => location.reload()}>
                {t.boot.reload}
              </Button>
            }
          />
        )}
      </div>
    </main>
  )
}

// A route chunk that fails to load (a flaky connection, or a tab kept open across a deploy
// that removed its hashed chunk) rejects during render. Without a boundary React unmounts
// the root and leaves a blank page.
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? <LoadFailed /> : this.props.children
  }
}
