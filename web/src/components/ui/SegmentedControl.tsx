import { useId, useLayoutEffect, useRef } from 'react'
import { cx } from './cx'
import './SegmentedControl.css'

// One choice of a radio group; shared with RadioChips. Numbers are allowed (Min score's
// 0/50/65/80): onChange hands back option.value itself, not the input's string.
export type ChoiceValue = string | number

export interface ChoiceOption<V extends ChoiceValue> {
  value: V
  label: string
  disabled?: boolean
}

interface Props<V extends ChoiceValue> {
  legend: string
  // Read by screen readers but not drawn, e.g. "Published" in the toolbar (§4.5).
  hideLegend?: boolean
  options: readonly ChoiceOption<V>[]
  value: V
  onChange: (value: V) => void
  name?: string
  disabled?: boolean
  className?: string
}

// Native radios, so arrow keys, form semantics and Playwright's .check() all just work.
// Each radio is stretched invisibly over its segment; the label text gives its name.
export function SegmentedControl<V extends ChoiceValue>({
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
  const trackRef = useRef<HTMLDivElement>(null)

  // On narrow screens the track scrolls sideways. Focus scrolls for keyboard users, but a
  // value set from saved prefs or another control needs bringing into view by hand.
  useLayoutEffect(() => {
    const track = trackRef.current
    const option = track?.querySelector('input:checked')?.parentElement
    if (!track || !option || track.scrollWidth <= track.clientWidth) return
    const start = option.offsetLeft
    const end = start + option.offsetWidth
    const pad = parseFloat(getComputedStyle(track).paddingInlineEnd) || 0
    if (start < track.scrollLeft) track.scrollLeft = start - pad
    else if (end > track.scrollLeft + track.clientWidth) track.scrollLeft = end - track.clientWidth + pad
  }, [value])

  return (
    <fieldset className={cx('ui-segmented', className)} disabled={disabled}>
      <legend className={cx('ui-segmented__legend', hideLegend && 'visually-hidden')}>{legend}</legend>
      <div ref={trackRef} className="ui-segmented__track">
        {options.map((option) => (
          <label key={option.value} className="ui-segmented__option">
            <input
              type="radio"
              className="ui-segmented__input"
              name={name ?? autoName}
              value={option.value}
              checked={option.value === value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span className="ui-segmented__label">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
