import type { ComponentPropsWithRef } from 'react'
import { cx } from './cx'
import './Kbd.css'

// A key name in shortcut hints and the shortcuts dialog: <Kbd>j</Kbd>, <Kbd>Esc</Kbd>.
export function Kbd({ className, ...rest }: ComponentPropsWithRef<'kbd'>) {
  return <kbd {...rest} className={cx('ui-kbd', className)} />
}
