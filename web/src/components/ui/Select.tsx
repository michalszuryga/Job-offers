import type { ComponentPropsWithRef, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Field } from './Field'
import { Icon } from './Icon'
import './Select.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectGroup {
  label: string
  options: readonly SelectOption[]
}

export type SelectItem = SelectOption | SelectGroup

interface Props extends Omit<ComponentPropsWithRef<'select'>, 'multiple' | 'size'> {
  label: string
  hideLabel?: boolean
  hint?: string
  error?: string
  // Options as data (groups become <optgroup>); or pass <option>/<optgroup> children instead.
  options?: readonly SelectItem[]
}

function renderOption({ value, label, disabled }: SelectOption) {
  return (
    <option key={value} value={value} disabled={disabled}>
      {label}
    </option>
  )
}

function renderItems(items: readonly SelectItem[]): ReactNode {
  return items.map((item) =>
    'options' in item ? (
      <optgroup key={`group:${item.label}`} label={item.label}>
        {item.options.map(renderOption)}
      </optgroup>
    ) : (
      renderOption(item)
    ),
  )
}

// A native <select> (the platform picker is the best one on phones), drawn like the text
// fields with a Lucide chevron. className goes on the field wrapper; the rest on <select>.
export function Select({
  label,
  hideLabel,
  hint,
  error,
  options,
  children,
  id,
  className,
  'aria-describedby': describedBy,
  ...select
}: Props) {
  return (
    <Field id={id} label={label} hideLabel={hideLabel} hint={hint} error={error} describedBy={describedBy} className={className}>
      {(control) => (
        <div className="ui-field__control ui-select">
          <select {...select} {...control} className="ui-field__input ui-select__input">
            {options ? renderItems(options) : children}
          </select>
          <Icon icon={ChevronDown} className="ui-select__chevron" />
        </div>
      )}
    </Field>
  )
}
