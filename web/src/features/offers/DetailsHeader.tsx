import { ChevronDown, ChevronLeft, ChevronUp, ExternalLink, ThumbsDown, X } from 'lucide-react'
import { Button, cx, IconButton, VisuallyHidden } from '../../components/ui'
import { useI18n } from '../../i18n'
import { closeOffer, openOffer } from '../../lib/router'
import type { Status } from '../../lib/types'
import type { ListPosition } from './position'
import { StatusSelect } from './StatusSelect'
import './DetailsHeader.css'

interface Props {
  wide: boolean
  position: ListPosition | null
  status: Status | null
  onStatus: (status: Status) => void
  // "Not for me" (DetailsView): null hides it, once the offer is Not for me already.
  onDismiss: (() => void) | null
  url: string
}

// Sticky, 56 px (§4.8). Back (phone) or Close (desktop) go through the router's close, like
// Esc and the back gesture. Previous and next replace the history entry (lib/router.ts
// openOffer), so back still lands on the list. Desktop also gets "Not for me", the Status
// select and "Open offer" here; the phone has them in the action bar at the bottom.
export function DetailsHeader({ wide, position, status, onStatus, onDismiss, url }: Props) {
  const { t } = useI18n()
  // aria-disabled rather than disabled at either end: focus stays on the button that took
  // you there instead of dropping to <body>.
  const step = (id: string | null) => () => {
    if (id != null) openOffer(id)
  }

  return (
    <div className={cx('details-header', wide && 'details-header--wide')}>
      <IconButton
        icon={wide ? X : ChevronLeft}
        aria-label={wide ? t.details.close : t.details.back}
        className="details-header__close"
        onClick={closeOffer}
      />
      {position && (
        <div className="details-header__nav">
          <p className="details-header__position">
            <span aria-hidden="true">{t.details.position(position.index + 1, position.total)}</span>
            <VisuallyHidden>{t.details.positionLabel(position.index + 1, position.total)}</VisuallyHidden>
          </p>
          <IconButton
            icon={ChevronUp}
            aria-label={t.details.previous}
            aria-disabled={position.previousId == null || undefined}
            className="details-header__step"
            onClick={step(position.previousId)}
          />
          <IconButton
            icon={ChevronDown}
            aria-label={t.details.next}
            aria-disabled={position.nextId == null || undefined}
            className="details-header__step"
            onClick={step(position.nextId)}
          />
        </div>
      )}
      {wide && (
        <div className="details-header__actions">
          {onDismiss && (
            <Button
              variant="secondary"
              icon={ThumbsDown}
              aria-keyshortcuts="x"
              className="details-header__dismiss"
              onClick={onDismiss}
            >
              {t.details.dismiss}
            </Button>
          )}
          <StatusSelect status={status} onChange={onStatus} className="details-header__status" />
          <Button
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            trailingIcon={ExternalLink}
            className="details-header__open"
          >
            {t.details.openOffer}
            <VisuallyHidden> {t.details.newTab}</VisuallyHidden>
          </Button>
        </div>
      )}
    </div>
  )
}
