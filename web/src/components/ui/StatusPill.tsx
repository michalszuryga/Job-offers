import { useI18n } from '../../i18n'
import { isStatus, STATUS_META } from '../../lib/status'
import { cx } from './cx'
import './StatusPill.css'

interface Props {
  // Typed loosely on purpose: offers carry whatever the database holds.
  status: string | null | undefined
  className?: string
}

// The label comes from i18n here rather than a prop, so no caller can render the raw enum
// (criterion 1). A status this build doesn't know renders nothing (lib/status.ts isStatus).
export function StatusPill({ status, className }: Props) {
  const { t } = useI18n()
  if (!isStatus(status)) return null
  return (
    <span className={cx('ui-status-pill', `ui-status-pill--${STATUS_META[status].tone}`, className)}>
      <span className="ui-status-pill__dot" aria-hidden="true" />
      {t.status[status]}
    </span>
  )
}
