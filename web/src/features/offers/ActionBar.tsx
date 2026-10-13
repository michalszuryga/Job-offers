import { ExternalLink, Star, ThumbsDown } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Button, IconButton, VisuallyHidden } from '../../components/ui'
import { useI18n } from '../../i18n'
import { statusAtLeast } from '../../lib/status'
import type { Status } from '../../lib/types'
import { StatusSelect } from './StatusSelect'
import './ActionBar.css'

interface Props {
  status: Status | null
  onStatus: (status: Status) => void
  // "Not for me" (DetailsView): null hides it, once the offer is Not for me already.
  onDismiss: (() => void) | null
  url: string
}

// The phone's details actions (§4.8), pinned to the bottom: 64 px plus the home indicator.
// A status change takes one tap on the Star or "Not for me", or two through the select, and
// no Save (§1 #3). To fit 360 px, "Not for me" stacks its label under the icon and "Open
// offer" shows only its icon (its name stays for screen readers).
export function ActionBar({ status, onStatus, onDismiss, url }: Props) {
  const { t } = useI18n()
  const barRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)

  // The Toaster's contract (Toaster.css): while mounted, publish the bar's full rendered
  // height, safe area included, so a toast sits above it and not over it.
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--actionbar-h', `${bar.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--actionbar-h')
    }
  }, [])

  return (
    <div ref={barRef} className="action-bar">
      <StatusSelect ref={selectRef} status={status} onChange={onStatus} className="action-bar__status" />
      {!statusAtLeast(status, 'INTERESTED') && (
        <IconButton
          icon={Star}
          variant="secondary"
          aria-label={t.details.interested}
          className="action-bar__star"
          onClick={() => {
            onStatus('INTERESTED')
            // The Star goes once the offer is Interested; focus moves to the status it set.
            selectRef.current?.focus()
          }}
        />
      )}
      {onDismiss && (
        <Button variant="secondary" icon={ThumbsDown} aria-keyshortcuts="x" className="action-bar__dismiss" onClick={onDismiss}>
          {t.details.dismiss}
        </Button>
      )}
      <Button href={url} target="_blank" rel="noopener noreferrer" icon={ExternalLink} className="action-bar__open">
        <VisuallyHidden>
          {t.details.openOffer} {t.details.newTab}
        </VisuallyHidden>
      </Button>
    </div>
  )
}
