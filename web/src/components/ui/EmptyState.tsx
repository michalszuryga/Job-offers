import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'
import './EmptyState.css'

interface Props {
  icon?: LucideIcon
  title: ReactNode
  // Fits the outline of the view it sits in: one h1 per view (§5), so never 1.
  headingLevel?: 2 | 3 | 4
  // Body copy; a string or a short fragment of inline text.
  children?: ReactNode
  // Buttons or links, e.g. [Show last 3 days] or [Clear filters] (§4.10).
  actions?: ReactNode
  className?: string
}

// "Nothing here" with a way out. Static: whatever triggered it (the count line, a status)
// announces the change, so this adds no live region of its own.
export function EmptyState({ icon, title, headingLevel = 2, children, actions, className }: Props) {
  const Heading = `h${headingLevel}` as const
  return (
    <div className={cx('ui-empty', className)}>
      {icon && (
        <span className="ui-empty__icon">
          <Icon icon={icon} size={24} />
        </span>
      )}
      <Heading className="ui-empty__title">{title}</Heading>
      {children && <p className="ui-empty__body">{children}</p>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  )
}
