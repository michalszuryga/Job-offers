import { useEffect, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { parseDescription, type Block } from '../lib/description'
import { formatAgo, formatPoints, formatSalary, timeOf } from '../lib/format'
import { loadOfferDetails, trackingQueue } from '../lib/offers'
import { breakdownRows, parseBreakdown, SCORE_MAX, scoreBand, scoringFrom, type BreakdownRow } from '../lib/score'
import { STATUS_GROUPS } from '../lib/status'
import type { Offer, OfferDetails, ScoringProfile, Status } from '../lib/types'
import { changedFields, type Tracking } from '../lib/writeQueue'

interface Props {
  offer: Offer
  scoringProfile: ScoringProfile | null
  onClose: () => void
  onSaved: (offer: Offer) => void
}

const MATCHED_KEYS = ['matched_roles', 'matched_technologies', 'matched_domains', 'matched_ai']

// Text nodes only, never HTML: scraped content is untrusted.
function DescriptionBlock({ block }: { block: Block }) {
  if (block.type === 'h4') return <h4>{block.text}</h4>
  if (block.type === 'p') return <p>{block.text}</p>
  return (
    <ul>
      {block.items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export function OfferDetailsPanel({ offer, scoringProfile, onClose, onSaved }: Props) {
  const { t, lang } = useI18n()
  const [details, setDetails] = useState<OfferDetails | 'error' | null>(null)
  const [status, setStatus] = useState<Status>(offer.application_status ?? 'TO_REVIEW')
  const [rate, setRate] = useState(offer.applied_rate ?? '')
  const [notice, setNotice] = useState(offer.notice_period ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    loadOfferDetails(offer.external_id).then(setDetails).catch(() => setDetails('error'))
  }, [offer.external_id])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaveState('saving')
    const confirmed: Tracking = {
      status: offer.application_status ?? 'TO_REVIEW',
      rate: offer.applied_rate ?? '',
      notice: offer.notice_period ?? '',
    }
    // Only what was edited here. This form may have opened while an earlier write for this
    // offer was still in flight; untouched fields then follow that write, not this stale copy.
    const change = changedFields({ status, rate, notice }, confirmed)
    try {
      const saved = await trackingQueue.enqueue(offer.external_id, change, confirmed)
      onSaved({ ...offer, application_status: saved.status, applied_rate: saved.rate, notice_period: saved.notice })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const loaded = details === 'error' ? null : details
  const breakdown = parseBreakdown(loaded?.score_breakdown)
  const summary = Object.keys(breakdown).length > 0 ? breakdownRows(breakdown, scoringFrom(scoringProfile)) : null
  const matched = MATCHED_KEYS.flatMap((key) =>
    Array.isArray(breakdown[key]) ? (breakdown[key] as unknown[]).filter((term) => typeof term === 'string') : [],
  )
  const blocks = loaded ? parseDescription(loaded.description) : []
  const score = offer.score == null ? null : Math.round(offer.score)

  const pointsRow = (row: BreakdownRow) => (
    <li key={row.key}>
      {t.score.rows[row.key]}: <strong>{t.score.points(formatPoints(row.points, lang), row.max)}</strong>
    </li>
  )

  return (
    <aside className="details" aria-label={t.details.label}>
      <button className="link close" onClick={onClose}>
        {t.details.back}
      </button>
      <h2>{offer.title}</h2>
      <p className="muted">
        {[offer.company, offer.location, offer.contract].filter(Boolean).join(' · ')}
      </p>
      <p>
        <strong>{formatSalary(offer, lang) || t.salary.notListed}</strong>
        <span className="muted">
          {' · '}
          {timeOf(offer.published_at) == null
            ? t.details.publishedUnknown
            : t.details.published(formatAgo(offer.published_at, lang))}
        </span>
      </p>
      <a className="button" href={offer.url} target="_blank" rel="noopener noreferrer">
        {t.details.openOffer}
      </a>

      <form className="tracking" onSubmit={save}>
        <label>
          {t.details.status}
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUS_GROUPS.map((group) => (
              <optgroup key={group.key} label={t.statusGroups[group.key]}>
                {group.statuses.map((s) => (
                  <option key={s} value={s}>
                    {t.status[s]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          {t.details.rate}
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t.details.ratePlaceholder} />
        </label>
        <label>
          {t.details.notice}
          <input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder={t.details.noticePlaceholder} />
        </label>
        <button type="submit" disabled={saveState === 'saving'}>
          {saveState === 'saving' ? t.details.saving : t.details.save}
        </button>
        {saveState === 'saved' && <span role="status">{t.details.saved}</span>}
        {saveState === 'error' && (
          <span className="error" role="alert">
            {t.details.saveError}
          </span>
        )}
      </form>

      <section>
        <h3>
          {score == null ? t.score.bands.none : t.details.score(score)}
          {score != null && <span className="band-word"> · {t.score.bands[scoreBand(score)]}</span>}
        </h3>
        {summary && (
          <>
            {summary.rows.length + summary.penalties.length > 0 && (
              <ul className="points" aria-label={t.score.breakdown}>
                {summary.rows.map(pointsRow)}
                {summary.penalties.map((penalty) => (
                  <li key={penalty.key} className="penalty">
                    {t.score.penalties[penalty.key](penalty.days ?? 0)}:{' '}
                    <strong>{formatPoints(penalty.points, lang)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {summary.zeroRows.length > 0 && (
              <details className="zero-rows">
                <summary>{t.score.zeroRows(summary.zeroRows.length)}</summary>
                <ul className="points">{summary.zeroRows.map(pointsRow)}</ul>
              </details>
            )}
            <p className="score-total">
              <strong>{t.score.total(Math.round(summary.total), SCORE_MAX)}</strong>
              {summary.note && <span className="muted"> · {t.score[summary.note]}</span>}
            </p>
          </>
        )}
        {matched.length > 0 && <p className="muted">{t.details.matched(matched.join(', '))}</p>}
      </section>

      <section>
        <h3>{t.details.description}</h3>
        {details === 'error' ? (
          <p className="error">{t.details.loadError}</p>
        ) : !details ? (
          <p className="muted">{t.common.loading}</p>
        ) : blocks.length === 0 ? (
          <p className="muted">{t.details.noDescription}</p>
        ) : (
          <div className="description">
            {blocks.map((block, index) => (
              <DescriptionBlock key={index} block={block} />
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}
