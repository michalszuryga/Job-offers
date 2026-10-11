import { ChevronRight, CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Badge, cx, Icon, Sheet, type BadgeTone } from '../ui'
import { useI18n } from '../../i18n'
import { formatAgo, timeOf } from '../../lib/format'
import { errorKind, sourceState, sourceStats, type SourceState } from '../../lib/sources'
import type { FetchRun, SourceRun } from '../../lib/types'
import './SourcesSheet.css'

const STATE_ICONS: Record<SourceState, LucideIcon> = { ok: CircleCheck, partial: TriangleAlert, failed: CircleAlert }
const STATE_TONES: Record<SourceState, BadgeTone> = { ok: 'success', partial: 'warning', failed: 'danger' }

interface Props {
  open: boolean
  onClose: () => void
  run: FetchRun | null
}

function SourceRow({ result }: { result: SourceRun }) {
  const { t } = useI18n()
  const state = sourceState(result)
  const stats = sourceStats(result).map(({ key, value }) => t.sources.stats[key](value))
  const error = errorKind(result)
  // As the collector recorded it, for "Technical details" only (§4.10).
  const raw = [result.error_type, result.error].filter(Boolean).join(': ')

  return (
    <li className={cx('sources__row', `sources__row--${state}`)}>
      <Icon icon={STATE_ICONS[state]} size={20} className="sources__icon" />
      <div className="sources__body">
        <div className="sources__head">
          <span className="sources__name">{result.name}</span>
          <Badge tone={STATE_TONES[state]}>{t.sources.states[state]}</Badge>
        </div>
        {state === 'failed' && <p className="sources__problem">{t.sources.errors[error.kind](error.status)}</p>}
        {state === 'partial' && <p className="sources__problem">{t.sources.partial}</p>}
        {stats.length > 0 && <p className="sources__stats">{stats.join(' · ')}</p>}
        {state !== 'ok' && raw && (
          <details className="sources__details">
            <summary className="sources__summary">
              <Icon icon={ChevronRight} className="sources__chevron" />
              {t.common.technicalDetails}
            </summary>
            <pre className="sources__raw">{raw}</pre>
          </details>
        )}
      </div>
    </li>
  )
}

// Every board in the last fetch (§4.10): counts, and what went wrong in words, with the raw
// error folded away. Opened from the BatchHeader chip or the desktop summary.
export function SourcesSheet({ open, onClose, run }: Props) {
  const { t, lang } = useI18n()
  const results = run?.results ?? []
  return (
    <Sheet open={open} onClose={onClose} title={t.sources.title}>
      {run && timeOf(run.finished_at) != null && (
        <p className="sources__when">{t.sources.fetched(formatAgo(run.finished_at, lang))}</p>
      )}
      {results.length === 0 ? (
        <p className="sources__when">{t.batch.noFetch}</p>
      ) : (
        <ul className="sources">
          {results.map((result, index) => (
            <SourceRow key={`${result.name}-${index}`} result={result} />
          ))}
        </ul>
      )}
    </Sheet>
  )
}
