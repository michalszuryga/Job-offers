import type { ComponentPropsWithRef, MouseEvent, ReactNode } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cx } from './cx'
import { Icon } from './Icon'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'sm'

interface OwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  trailingIcon?: LucideIcon
  // Spinner over the label; the button keeps its width and its focus.
  loading?: boolean
  fullWidth?: boolean
  children: ReactNode
}

// An href makes it an <a> with the same look, so navigation stays a real link.
type AsButton = OwnProps & Omit<ComponentPropsWithRef<'button'>, keyof OwnProps> & { href?: undefined }
type AsLink = OwnProps & Omit<ComponentPropsWithRef<'a'>, keyof OwnProps> & { href: string }
export type ButtonProps = AsButton | AsLink

// §2.7: 20 px in buttons, small ones included.
const ICON_SIZE = 20

// Swallows activation while busy: preventDefault also stops form submits and link navigation.
function ignore(event: MouseEvent) {
  event.preventDefault()
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, fullWidth && 'ui-button--full', className)
  const content = (
    <>
      {icon && <Icon icon={icon} size={ICON_SIZE} className="ui-button__icon" />}
      <span className="ui-button__label">{children}</span>
      {trailingIcon && <Icon icon={trailingIcon} size={ICON_SIZE} className="ui-button__icon" />}
      {loading && <Icon icon={LoaderCircle} size={ICON_SIZE} className="ui-button__spinner" />}
    </>
  )
  // Not `disabled`: that would drop focus to <body> mid-submit. aria-disabled says it instead.
  const busy = loading ? { 'aria-busy': true, 'aria-disabled': true, onClick: ignore } : {}

  if (rest.href !== undefined) {
    return <a {...rest} {...busy} className={classes}>{content}</a>
  }
  return <button type="button" {...rest} {...busy} className={classes}>{content}</button>
}
