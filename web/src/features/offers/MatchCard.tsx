import { ChevronRight } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Icon, ScoreBar, ScoreRing, Skeleton, type ScoreBarTone } from '../../components/ui'
import { useI18n } from '../../i18n'
import { formatDay, formatPoints } from '../../lib/format'
import { breakdownRows, SCORE_MAX, scoreBand, type Breakdown, type BreakdownRow, type ScoringConfig } from '../../lib/score'
import { matchedTerms, scoresAge, whyParts, type WhyPart } from './match'
import './MatchCard.css'

interface Props {
  score: number | null
  // Null while the details load; empty when the offer has none.
  breakdown: Breakdown | null
  scoring: ScoringConfig
  // The profile's spelling of matched terms (match.ts candidateCasing).
  casing: ReadonlyMap<string, string>
  // meta 'scores_refreshed_on', 'YYYY-MM-DD'.
  scoresRefreshedOn: string | null
}

// A category's terms read best short: "Postman, SQL, Playwright +1".
const MAX_TERMS = 3

// Why this score (§4.8): the ring and band word, the top reasons in a line, then every
// category against its maximum. The rows add up to the total, as score_job() adds them.
// No hard_reject state: rejected offers never load.
export function MatchCard({ score, breakdown, scoring, casing, scoresRefreshedOn }: Props) {
  const { t, lang } = useI18n()
  const keywordsId = useId()
  const value = score == null ? null : Math.round(score)
  const band = scoreBand(score)
  const tone: ScoreBarTone = band === 'none' ? 'brand' : band

  const summary = useMemo(
    () => (breakdown && Object.keys(breakdown).length > 0 ? breakdownRows(breakdown, scoring) : null),
    [breakdown, scoring],
  )
  const why = summary && breakdown ? whyParts(breakdown, summary.rows, casing) : []
  const terms = breakdown ? matchedTerms(breakdown) : []
  const age = scoresRefreshedOn ? scoresAge(scoresRefreshedOn) : null
  const day = scoresRefreshedOn ? formatDay(scoresRefreshedOn, lang) : ''
  const updated =
    age === 'today' ? t.details.scoresToday : age === 'yesterday' ? t.details.scoresYesterday : day ? t.details.scoresOn(day) : null

  const part = ({ key, terms: words }: WhyPart) =>
    words.length === 0
      ? t.score.rows[key]
      : words.slice(0, MAX_TERMS).join(', ') + (words.length > MAX_TERMS ? ` +${words.length - MAX_TERMS}` : '')

  const row = (item: BreakdownRow) => (
    <li key={item.key} className="match__row">
      <span className="match__label">{t.score.rows[item.key]}</span>
      <ScoreBar value={item.points} max={item.max} tone={tone} className="match__bar" />
      <span className="match__points">{t.score.points(formatPoints(item.points, lang), item.max)}</span>
    </li>
  )

  return (
    <div className="match">
      <div className="match__summary">
        <ScoreRing score={score} size={64} />
        <div className="match__lines">
          {/* The ring already says the band to screen readers ("Match 75 of 100, Strong match"). */}
          <p className="match__band" aria-hidden="true">
            {t.score.bands[band]}
          </p>
          {breakdown == null && value != null ? (
            <Skeleton width="70%" className="match__why-skeleton" />
          ) : (
            why.length > 0 && <p className="match__why">{why.map(part).join(' · ')}</p>
          )}
          {updated && <p className="match__updated">{updated}</p>}
        </div>
      </div>

      {breakdown == null && value != null && (
        <div className="match__loading" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} width={`${88 - n * 12}%`} />
          ))}
        </div>
      )}

      {summary && value != null && (
        <div className="match__breakdown">
          <h3 className="match__heading">
            {t.details.why(value)}
          </h3>
          {summary.rows.length + summary.penalties.length > 0 && (
            <ul className="match__rows" aria-label={t.score.breakdown}>
              {summary.rows.map(row)}
              {summary.penalties.map((penalty) => (
                <li key={penalty.key} className="match__row match__row--penalty">
                  <span className="match__label">{t.score.penalties[penalty.key](penalty.days ?? 0)}</span>
                  <span className="match__points match__points--penalty">{formatPoints(penalty.points, lang)}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.zeroRows.length > 0 && (
            <details className="match__zero">
              <summary className="match__zero-summary">
                <Icon icon={ChevronRight} className="match__chevron" />
                {t.score.zeroRows(summary.zeroRows.length)}
              </summary>
              <ul className="match__rows match__rows--zero">{summary.zeroRows.map(row)}</ul>
            </details>
          )}
          <p className="match__total">
            {t.score.total(Math.round(summary.total), SCORE_MAX)}
            {summary.note && <span className="match__note"> · {t.score[summary.note]}</span>}
          </p>
        </div>
      )}

      {terms.length > 0 && (
        <div className="match__keywords">
          {/* Names the list (aria-labelledby works on hidden text); hidden so it isn't read twice. */}
          <p id={keywordsId} className="match__keywords-label" aria-hidden="true">
            {t.score.matchedKeywords}
          </p>
          <ul className="match__chips" aria-labelledby={keywordsId}>
            {terms.map((term) => (
              <li key={term} className="match__chip">
                {term}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
