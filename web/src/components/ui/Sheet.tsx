import { X } from 'lucide-react'
import { useEffect, useId, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '../../i18n'
import { cx } from './cx'
import { IconButton } from './IconButton'
import { setDialogOpen } from './openDialogs'
import './Sheet.css'

interface Props {
  open: boolean
  // Called once whenever the sheet closes itself: Esc, the Android back gesture (CloseWatcher),
  // the close button or a backdrop click. Set `open` to false in it.
  onClose: () => void
  // Names the dialog (aria-labelledby), e.g. "Filters".
  title: ReactNode
  children: ReactNode
  // Sticky actions under the content, e.g. [Reset] [Show 12 offers].
  footer?: ReactNode
  // Overrides "Close" on the X button.
  closeLabel?: string
  className?: string
}

// Outside the dialog's box means the click landed on ::backdrop. Clicks on the dialog's own
// scrollbar also target the dialog, but inside its box.
function onBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
}

// A modal <dialog> (§3): a bottom sheet under 1024 px, a centred modal above. It never
// touches history; React follows the dialog's own 'close' event, so every way of closing
// it (Esc, back gesture, X, backdrop) runs through one path. Page scroll is locked by
// html:has(dialog[open]) in base.css; the browser returns focus to the opener on close.
export function Sheet({ open, onClose, title, children, footer, closeLabel, className }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // A backdrop click must start on the backdrop too: a text selection dragged out of the
  // sheet ends with a click on the backdrop.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    setDialogOpen(dialog, dialog.open)
    // Also covers unmounting while open, which removes it from the top layer without a 'close' event.
    return () => setDialogOpen(dialog, false)
  }, [open])

  const handleClose = () => {
    if (ref.current) setDialogOpen(ref.current, false)
    // Still open in props means the dialog closed itself; if the parent closed it, it already knows.
    if (open) onClose()
  }

  const close = () => ref.current?.close()

  return (
    <dialog
      ref={ref}
      className={cx('ui-sheet', footer != null && 'ui-sheet--footer', className)}
      aria-labelledby={titleId}
      onClose={handleClose}
      onPointerDown={(event: PointerEvent<HTMLDialogElement>) => {
        pressedBackdrop.current = onBackdrop(event)
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && onBackdrop(event)) close()
        pressedBackdrop.current = false
      }}
    >
      <div className="ui-sheet__header">
        <h2 id={titleId} className="ui-sheet__title">
          {title}
        </h2>
        <IconButton icon={X} aria-label={closeLabel ?? t.common.close} onClick={close} className="ui-sheet__close" />
      </div>
      <div className="ui-sheet__body">{children}</div>
      {footer != null && <div className="ui-sheet__footer">{footer}</div>}
    </dialog>
  )
}
