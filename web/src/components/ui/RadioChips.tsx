import { useId } from 'react'
import { Check } from 'lucide-react'
import { cx } from './cx'
import { Icon } from './Icon'
import type { ChoiceOption, ChoiceValue } from './SegmentedControl'
import './RadioChips.css'

interface Props<V extends ChoiceValue> {
  legend: string
  // Read by screen readers but not drawn, for a group whose context already names it.
  hideLegend?: boolean
  options: readonly ChoiceOption<V>[]
  value: V
  onChange: (value: V) => void
  name?: string
  disabled?: boolean
  className?: string
}

// A single choice drawn as chips that wrap, e.g. Min score: Any score | 50+ | 65+ | 80+ (§4.6).
// Native radios like SegmentedControl, so arrow keys, forms and Playwright's .check() work.
// The selected chip shows a check, so its tint is never the only cue.
export function RadioChips<V extends ChoiceValue>({
  legend,
  hideLegend = false,
  options,
  value,
  onChange,
  name,
  disabled,
  className,
}: Props<V>) {
  const autoName = useId()
  return (
    <fieldset className={cx('ui-chips', className)} disabled={disabled}>
      <legend className={cx('ui-chips__legend', hideLegend && 'visually-hidden')}>{legend}</legend>
      <div className="ui-chips__list">
        {options.map((option) => (
          <label key={option.value} className="ui-chips__option">
            <input
              type="radio"
              className="ui-chips__input"
              name={name ?? autoName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="ui-chips__label">
              <Icon icon={Check} className="ui-chips__check" />
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
