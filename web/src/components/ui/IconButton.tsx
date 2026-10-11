import type { ComponentPropsWithRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx } from './cx'
import { Icon } from './Icon'
import './IconButton.css'

interface Props extends Omit<ComponentPropsWithRef<'button'>, 'children' | 'aria-label'> {
  icon: LucideIcon
  // Required: an icon has no text, so this is the button's only name (§2.7).
  'aria-label': string
  variant?: 'ghost' | 'secondary'
  size?: 'md' | 'sm'
  // A count drawn on the corner, e.g. active filters. 0 or less hides it.
  badge?: number
}

export function IconButton({ icon, 'aria-label': label, variant = 'ghost', size = 'md', badge, className, ...rest }: Props) {
  const count = badge != null && badge > 0 ? badge : null
  return (
    <button
      type="button"
      {...rest}
      // The badge is drawn for the eye only, so the count joins the name: "Filters (2)".
      aria-label={count == null ? label : `${label} (${count})`}
      className={cx('ui-icon-button', `ui-icon-button--${variant}`, `ui-icon-button--${size}`, className)}
    >
      <Icon icon={icon} size={20} />
      {count != null && (
        <span className="ui-icon-button__badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  )
}
