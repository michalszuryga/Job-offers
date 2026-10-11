import { ChevronRight, CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import './Callout.css'

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger'

// A distinct shape per tone, so the tint is never the only signal.
const TONE_ICONS: Record<CalloutTone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
}

interface Props {
  tone?: CalloutTone
  title?: ReactNode
  // Body copy: a sentence or two of friendly text, never the raw error (§2.1 voice).
  children?: ReactNode
  // Buttons or links, e.g. [Retry].
  actions?: ReactNode
  // Raw text (a Supabase or board error) folded under "Technical details"; rendered as a text node.
  details?: string
  // Overrides the "Technical details" summary.
  detailsLabel?: string
  className?: string
}

// Never a live region itself: one inserted together with its text may go unannounced. A
// callout that appears in response to something (an expired link, a load error) goes into
// the view's one status region (§4.2), kept mounted while the callout comes and goes:
// <div role="status">{error && <Callout … />}</div>.
export function Callout({ tone = 'info', title, children, actions, details, detailsLabel, className }: Props) {
  const { t } = useI18n()
  return (
    <div className={cx('ui-callout', `ui-callout--${tone}`, className)}>
      <Icon icon={TONE_ICONS[tone]} size={20} className="ui-callout__icon" />
      <div className="ui-callout__content">
        {title && <p className="ui-callout__title">{title}</p>}
        {children && <div className="ui-callout__body">{children}</div>}
        {actions && <div className="ui-callout__actions">{actions}</div>}
        {details && (
          <details className="ui-callout__details">
            <summary className="ui-callout__summary">
              <Icon icon={ChevronRight} className="ui-callout__chevron" />
              {detailsLabel ?? t.common.technicalDetails}
            </summary>
            <pre className="ui-callout__raw">{details}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
