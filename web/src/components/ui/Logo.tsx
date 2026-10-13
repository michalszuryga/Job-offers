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

// Mark geometry is brand/mark.svg (§2.1), flat since the visual refresh. Colours come from --mark-* through style,
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
        <rect width="32" height="32" rx="9" style={{ fill: 'var(--mark-bg)' }} />
        <g fill="none" strokeLinecap="round" style={{ stroke: 'var(--mark-ink)' }}>
          <circle cx="16" cy="16" r="10" strokeWidth="2.5" strokeDasharray="50.3 12.6" transform="rotate(-90 16 16)" />
          <path d="M18.5 10.5v6.5a3.5 3.5 0 0 1-7 0" strokeWidth="3" strokeLinejoin="round" />
        </g>
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
