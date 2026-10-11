import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'

// Text for screen readers only. The .visually-hidden rule lives in styles/utilities.css,
// which every entry loads, so this component needs no stylesheet of its own.
export function VisuallyHidden({ className, ...rest }: ComponentPropsWithRef<'span'>) {
  return <span {...rest} className={cx('visually-hidden', className)} />
}
