import { useId, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { cx } from './cx'
import { Icon } from './Icon'
import './Field.css'

// What a control needs to be tied to its label, hint and error.
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface Props {
  id?: string
  label: string
  // Kept for screen readers but not drawn, for a control whose context already says it.
  hideLabel?: boolean
  hint?: string
  error?: string
  // A caller's own aria-describedby, kept after the error and the hint.
  describedBy?: string
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

// Shared shell of TextField and Select: a visible <label>, then the control, then hint
// and error wired through aria-describedby. The error has an icon, so colour isn't the only cue.
export function Field({ id, label, hideLabel = false, hint, error, describedBy, className, children }: Props) {
  const autoId = useId()
  const controlId = id ?? autoId
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const control: FieldControlProps = { id: controlId }
  const described = cx(error && errorId, hint && hintId, describedBy)
  if (described) control['aria-describedby'] = described
  if (error) control['aria-invalid'] = true

  return (
    <div className={cx('ui-field', className)}>
      <label className={cx('ui-field__label', hideLabel && 'visually-hidden')} htmlFor={controlId}>
        {label}
      </label>
      {children(control)}
      {hint && (
        <p id={hintId} className="ui-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="ui-field__error">
          <Icon icon={CircleAlert} className="ui-field__error-icon" />
          {error}
        </p>
      )}
    </div>
  )
}
