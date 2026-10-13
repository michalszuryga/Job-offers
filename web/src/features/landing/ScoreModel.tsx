import { ScoreBar } from '../../components/ui'
import { useI18n } from '../../i18n'
import { formatPoints } from '../../lib/format'
import { BAND_THRESHOLDS, SCORE_MAX, scoreModel, type ScoreBand } from '../../lib/score'

// Generated from the scoring model itself (lib/score.ts + score-defaults.json, mirrored from
// profile.yaml), so the landing can never promise points the scorer doesn't give.
const MODEL = scoreModel()
const LARGEST = Math.max(...MODEL.categories.map((category) => category.max))

const BANDS: readonly { band: Exclude<ScoreBand, 'none'>; from: number; to: number }[] = [
  { band: 'top', from: BAND_THRESHOLDS.top, to: SCORE_MAX },
  { band: 'strong', from: BAND_THRESHOLDS.strong, to: BAND_THRESHOLDS.top - 1 },
  { band: 'fair', from: BAND_THRESHOLDS.fair, to: BAND_THRESHOLDS.strong - 1 },
  { band: 'low', from: 0, to: BAND_THRESHOLDS.fair - 1 },
]

// Every category with its maximum, every penalty with its size, the four bands, and what
// never reaches scoring at all.
export function ScoreModel() {
  const { t, lang } = useI18n()
  const copy = t.landing.how
  return (
    <>
      <div className="how__grid">
        <div className="how__card">
          <h3 className="how__card-title">{copy.points}</h3>
          <ul className="how__rows">
            {MODEL.categories.map(({ key, max }) => (
              <li key={key} className="how__row">
                <span className="how__label">{t.score.rows[key]}</span>
                <ScoreBar value={max} max={LARGEST} className="how__bar" />
                <span className="how__value">{copy.upTo(max)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="how__side">
          <div className="how__card">
            <h3 className="how__card-title">{copy.penalties}</h3>
            <ul className="how__rows">
              {MODEL.penalties.map(({ key, points, days }) => (
                <li key={key} className="how__row how__row--penalty">
                  <span className="how__label">{t.score.penalties[key](days ?? 0)}</span>
                  <span className="how__value how__value--penalty">{formatPoints(points, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="how__card">
            <h3 className="how__card-title">{copy.bands}</h3>
            <ul className="how__bands">
              {BANDS.map(({ band, from, to }) => (
                <li key={band} className={`how__band how__band--${band}`}>
                  <span className="how__swatch" aria-hidden="true" />
                  <span className="how__label">{t.score.bands[band]}</span>
                  <span className="how__value">{copy.range(from, to)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="how__filtered">{t.score.hardExclusions}</p>
    </>
  )
}
