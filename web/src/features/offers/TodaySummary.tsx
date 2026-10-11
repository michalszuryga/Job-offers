import { ArrowRight } from 'lucide-react'
import { useId } from 'react'
import { Button, ScoreRing } from '../../components/ui'
import { useI18n } from '../../i18n'
import { bestOffer, inProgress } from '../../lib/batch'
import { formatAgo, timeOf } from '../../lib/format'
import { openOffer } from '../../lib/router'
import type { SourceHealth } from '../../lib/sources'
import type { FetchRun, Offer } from '../../lib/types'
import './TodaySummary.css'

interface Props {
  offers: readonly Offer[]
  // The New set and how many of it are reviewed (lib/batch.ts).
  batch: readonly Offer[]
  reviewed: number
  health: SourceHealth
  lastRun: FetchRun | null
  onSources: () => void
}

// Desktop with no offer open (§4.7): the right pane is never empty. Four tiles, and the best
// new match is plain text plus a button, so the list keeps the only link to each offer.
export function TodaySummary({ offers, batch, reviewed, health, lastRun, onSources }: Props) {
  const { t, lang } = useI18n()
  const hasRun = lastRun != null
  const finished = lastRun && timeOf(lastRun.finished_at) != null ? formatAgo(lastRun.finished_at, lang) : null
  const headingId = useId()
  const best = bestOffer(batch)
  const progress = inProgress(offers)
  // Every kind of trouble, so "1/3" is explained: "Pracuj.pl failed · 1 source partial".
  const trouble = [
    health.failed.length === 1 ? t.sources.failedOne(health.failed[0].name) : null,
    health.failed.length > 1 ? t.sources.failedMany(health.failed.length) : null,
    health.partial.length > 0 ? t.sources.partialCount(health.partial.length) : null,
  ].filter((part) => part != null)
  const sourcesDetail = !hasRun ? t.batch.noFetch : trouble.length > 0 ? trouble.join(' · ') : t.sources.allOk

  return (
    <section className="summary" aria-labelledby={headingId}>
      <h2 id={headingId} className="summary__heading">
        {t.summary.heading}
      </h2>
      <div className="summary__grid">
        <div className="summary__tile">
          <h3 className="summary__label">{t.summary.newTitle}</h3>
          <p className="summary__value">{batch.length}</p>
          <p className="summary__detail">
            {batch.length === 0
              ? finished
                ? t.sources.fetched(finished)
                : t.batch.noFetch
              : reviewed < batch.length
                ? t.summary.toReview(batch.length - reviewed)
                : t.summary.allReviewed}
          </p>
        </div>

        <div className="summary__tile summary__tile--best">
          <h3 className="summary__label">{t.summary.bestTitle}</h3>
          {best ? (
            <>
              <div className="summary__best">
                <ScoreRing score={best.score} />
                <p className="summary__best-title">{best.title}</p>
              </div>
              <div className="summary__actions">
                <Button size="sm" trailingIcon={ArrowRight} onClick={() => openOffer(best.external_id)}>
                  {t.summary.openBest}
                </Button>
              </div>
            </>
          ) : (
            <p className="summary__detail">{t.summary.noBest}</p>
          )}
        </div>

        <div className="summary__tile">
          <h3 className="summary__label">{t.summary.progressTitle}</h3>
          <p className="summary__value">{progress.preparing + progress.active}</p>
          <p className="summary__detail">{t.summary.progressDetail(progress.preparing, progress.active)}</p>
        </div>

        <div className="summary__tile">
          <h3 className="summary__label">{t.summary.sourcesTitle}</h3>
          <p className="summary__value">{hasRun ? t.summary.sourcesValue(health.okCount, health.total) : '–'}</p>
          <p className="summary__detail">{sourcesDetail}</p>
          {hasRun && (
            <div className="summary__actions">
              <Button variant="secondary" size="sm" onClick={onSources}>
                {t.summary.viewSources}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
