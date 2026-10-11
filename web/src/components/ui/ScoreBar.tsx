import type { CSSProperties } from 'react'
import type { ScoreBand } from '../../lib/score'
import { cx } from './cx'
import './ScoreBar.css'

export type ScoreBarTone = 'brand' | Exclude<ScoreBand, 'none'>

interface Props {
  value: number
  max: number
  tone?: ScoreBarTone
  className?: string
}

// One "Why 75?" row's share of its maximum (plan §4.8). Purely visual: the row prints
// "+20 / 25" beside it, so the bar is hidden from assistive tech. Penalties have no bar,
// so a negative value renders nothing; zero draws the empty track.
export function ScoreBar({ value, max, tone = 'brand', className }: Props) {
  // Negative (a penalty) or NaN.
  if (!(value >= 0)) return null
  const fill = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <span
      className={cx('ui-score-bar', `ui-score-bar--${tone}`, className)}
      style={{ '--fill': fill } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ui-score-bar__fill" />
    </span>
  )
}
