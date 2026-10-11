import { CircleAlert, RefreshCw, TriangleAlert } from 'lucide-react'
import { cx, Icon, IconButton } from '../../components/ui'
import { useI18n, type Messages } from '../../i18n'
import { formatAgo, timeOf } from '../../lib/format'
import type { SourceHealth } from '../../lib/sources'
import type { FetchRun } from '../../lib/types'
import './BatchHeader.css'

interface Props {
  lastRun: FetchRun | null
  // The New set and how many of it are reviewed (lib/batch.ts).
  newCount: number
  reviewed: number
  health: SourceHealth
  refreshing: boolean
  onRefresh: () => void
  onSources: () => void
}

// "Pracuj.pl failed" or "2 sources failed" (warning); partial alone is neutral (§4.5).
// Nothing to report: no chip.
function chipLabel(health: SourceHealth, t: Messages): string | null {
  if (health.failed.length === 1) return t.sources.failedOne(health.failed[0].name)
  if (health.failed.length > 1) return t.sources.failedMany(health.failed.length)
  if (health.partial.length > 0) return t.sources.partialCount(health.partial.length)
  return null
}

// The last fetch at a glance (§4.5): what it brought, which boards had trouble, and how
// far you are through it. It scrolls away with the page; the toolbar is what sticks.
export function BatchHeader({ lastRun, newCount, reviewed, health, refreshing, onRefresh, onSources }: Props) {
  const { t, lang } = useI18n()
  const summary = !lastRun
    ? t.batch.noFetch
    : timeOf(lastRun.finished_at) == null
      ? t.batch.summaryUndated(newCount)
      : t.batch.summary(newCount, formatAgo(lastRun.finished_at, lang))
  const chip = chipLabel(health, t)
  const percent = newCount > 0 ? Math.round((reviewed / newCount) * 100) : 0

  return (
    <div className="batch">
      <div className="batch__line">
        <p className="batch__summary">{summary}</p>
        {chip && (
          <button
            type="button"
            className={cx('batch__chip', health.state === 'failed' && 'batch__chip--failed')}
            onClick={onSources}
          >
            <Icon icon={health.state === 'failed' ? TriangleAlert : CircleAlert} className="batch__chip-icon" />
            <span className="batch__chip-label">{chip}</span>
          </button>
        )}
        <IconButton
          icon={RefreshCw}
          aria-label={t.batch.refresh}
          className={cx('batch__refresh', refreshing && 'batch__refresh--busy')}
          aria-busy={refreshing || undefined}
          // Already loading: a second press would only queue the same request.
          onClick={refreshing ? undefined : onRefresh}
        />
      </div>
      {newCount > 0 && (
        <div className="batch__progress">
          <span className="batch__bar" aria-hidden="true">
            <span className="batch__fill" style={{ inlineSize: `${percent}%` }} />
          </span>
          <span className="batch__reviewed">{t.batch.reviewed(reviewed, newCount)}</span>
        </div>
      )}
    </div>
  )
}
