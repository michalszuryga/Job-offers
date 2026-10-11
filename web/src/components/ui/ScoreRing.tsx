import { useI18n } from '../../i18n'
import { SCORE_MAX, scoreBand } from '../../lib/score'
import { cx } from './cx'
import './ScoreRing.css'

// 44 on cards, 64 in details. The stroke grows with the ring so both read as the same mark;
// the unscored ring is thinner and dashed, so "no score" never looks like a low one.
const STROKE = { 44: { arc: 3, none: 2 }, 64: { arc: 4, none: 2.5 } } as const
// Dashes around the unscored ring; whole numbers so the pattern closes without a seam.
const NONE_DASHES = { 44: 14, 64: 20 } as const

// Two decimals keep the SVG attributes readable without visible error.
const round = (n: number) => Math.round(n * 100) / 100

interface Props {
  score: number | null
  size?: 44 | 64
  // The band word beside the ring (details). Cards rely on the screen-reader text alone.
  showBand?: boolean
  className?: string
}

// Score as a ring (plan §2.3): arc length ∝ score in the band colour over a band-tint track,
// the number always --fg. Screen readers get one phrase, "Match 75 of 100, Strong match";
// the drawn number and the visible band word are hidden from them so nothing is read twice.
export function ScoreRing({ score, size = 44, showBand = false, className }: Props) {
  const { t } = useI18n()
  const band = scoreBand(score)
  const word = t.score.bands[band]
  const value = band === 'none' || score == null ? null : Math.round(score)

  const stroke = value == null ? STROKE[size].none : STROKE[size].arc
  const center = size / 2
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = value == null ? 0 : Math.min(Math.max(value, 0), SCORE_MAX) / SCORE_MAX
  // Round caps add half a stroke at each end: shorten the dash by one stroke and start it half
  // a stroke late, so the painted arc spans exactly the score from 12 o'clock.
  const dash = round(Math.max(0, circumference * fraction - stroke))
  const gap = round(circumference)
  const half = round(circumference / NONE_DASHES[size] / 2)

  return (
    <span className={cx('ui-score-ring', `ui-score-ring--${size}`, `ui-score-ring--${band}`, className)}>
      <span className="ui-score-ring__dial">
        <svg
          className="ui-score-ring__svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="ui-score-ring__track"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={value == null ? `${half} ${half}` : undefined}
          />
          {fraction > 0 && (
            <circle
              className="ui-score-ring__arc"
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-stroke / 2}
              transform={`rotate(-90 ${center} ${center})`}
            />
          )}
        </svg>
        <span className="ui-score-ring__value" aria-hidden="true">
          {value ?? '–'}
        </span>
      </span>
      <span className="visually-hidden">{value == null ? word : t.score.ring(value, word)}</span>
      {showBand && (
        <span className="ui-score-ring__band" aria-hidden="true">
          {word}
        </span>
      )}
    </span>
  )
}
