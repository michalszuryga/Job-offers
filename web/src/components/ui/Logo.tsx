import type { CSSProperties } from 'react'
import { cx } from './cx'
import './Logo.css'

interface Props {
  // Edge of the mark in px. The wordmark and the gap scale with it (10 px gap at 32).
  size?: number
  showWordmark?: boolean
  // Hidden from assistive tech, for a logo next to text that already names JOffers.
  decorative?: boolean
  className?: string
}

// The brand name is not translated, so it is a constant rather than i18n copy.
const NAME = 'JOffers'

// Mark geometry is brand/mark.svg (ranked bars + dot since the visual refresh). Colours come from --mark-* through style,
// because SVG presentation attributes don't resolve var().
export function Logo({ size = 32, showWordmark = true, decorative = false, className }: Props) {
  // With the wordmark shown the text names the logo, so the mark itself stays silent.
  const labelled = !decorative && !showWordmark
  return (
    <span
      className={cx('ui-logo', className)}
      style={{ '--logo-size': `${size}px` } as CSSProperties}
      aria-hidden={decorative || undefined}
    >
      <svg
        className="ui-logo__mark"
        viewBox="0 0 32 32"
        width={size}
        height={size}
        {...(labelled ? { role: 'img', 'aria-label': NAME } : { 'aria-hidden': true, focusable: false })}
      >
        <rect width="32" height="32" rx="8" style={{ fill: 'var(--mark-bg)' }} />
        {/* Three offers ranked by match, best on top; the dot is the one worth opening. */}
        <g style={{ fill: 'var(--mark-ink)' }}>
          <rect x="7" y="9" width="18" height="2.6" rx="1.3" />
          <rect x="7" y="14.7" width="13" height="2.6" rx="1.3" opacity=".75" />
          <rect x="7" y="20.4" width="8" height="2.6" rx="1.3" opacity=".5" />
        </g>
        <circle cx="24.5" cy="21.7" r="2.2" style={{ fill: 'var(--mark-dot)' }} />
      </svg>
      {/* translate="no": page translators would otherwise rewrite the brand name. */}
      {showWordmark && (
        <span className="ui-logo__word" translate="no">
          {NAME}
        </span>
      )}
    </span>
  )
}
