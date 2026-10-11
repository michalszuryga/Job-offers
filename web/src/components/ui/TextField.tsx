import type { ComponentPropsWithRef, KeyboardEvent } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cx } from './cx'
import { Field } from './Field'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import './TextField.css'

interface BaseProps extends Omit<ComponentPropsWithRef<'input'>, 'type' | 'size' | 'children'> {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  type?: 'text' | 'search' | 'email'
  // Leading icon, e.g. Search.
  icon?: LucideIcon
}

// The clear button needs both a handler and a name, or neither.
type ClearProps = { onClear: () => void; clearLabel: string } | { onClear?: undefined; clearLabel?: undefined }

export type TextFieldProps = BaseProps & ClearProps

// className goes on the field wrapper (layout); every other prop reaches the <input>.
export function TextField({
  label,
  hideLabel,
  hint,
  error,
  type = 'text',
  icon,
  onClear,
  clearLabel,
  id,
  className,
  'aria-describedby': describedBy,
  onKeyDown,
  ...input
}: TextFieldProps) {
  // Shown only for a controlled search field with something to clear.
  const clearable = type === 'search' && onClear != null && input.value != null && String(input.value) !== ''

  // Esc empties a search first, as native search fields do; preventDefault keeps that first
  // Esc from also closing the sheet around it, so a second Esc does that.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (!clearable || event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onClear()
  }

  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} describedBy={describedBy} className={className}>
      {(control) => (
        <div className={cx('ui-field__control', 'ui-text-field', icon && 'ui-text-field--icon', onClear && 'ui-text-field--clearable')}>
          {icon && <Icon icon={icon} className="ui-text-field__icon" />}
          <input
            {...input}
            {...control}
            type={type}
            className={cx('ui-field__input', 'ui-text-field__input')}
            onKeyDown={handleKeyDown}
          />
          {clearable && (
            <IconButton
              icon={X}
              size="sm"
              aria-label={clearLabel}
              className="ui-text-field__clear"
              onClick={() => {
                onClear()
                // The button unmounts once the value is empty; keep focus in the field, not on <body>.
                document.getElementById(control.id)?.focus()
              }}
            />
          )}
        </div>
      )}
    </Field>
  )
}
