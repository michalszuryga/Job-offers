import type { ReactNode } from 'react'
import { cx } from './cx'
import './Badge.css'

// `new` is the solid "New" badge (§2.4); `brand` is the tinted one ("Private beta", §2.1).
// The rest are tints for short labels whose words carry the meaning on their own.
export type BadgeTone = 'new' | 'brand' | 'neutral' | 'success' | 'info' | 'warning' | 'danger'

interface Props {
  tone?: BadgeTone
  // A number in a pill, e.g. the active-filter count. The caller puts the meaning in the
  // control's accessible name ("Filters, 2 active"); the digit alone says little.
  count?: boolean
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'neutral', count = false, className, children }: Props) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`, count && 'ui-badge--count', className)}>{children}</span>
}
