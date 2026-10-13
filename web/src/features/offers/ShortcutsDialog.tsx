import { X } from 'lucide-react'
import { useEffect, useId, useRef, type MouseEvent } from 'react'
import { IconButton, Kbd, setDialogOpen } from '../../components/ui'
import { useI18n, type Messages } from '../../i18n'
import { setShortcutsEnabled, useShortcutsEnabled } from '../../lib/shortcuts'
import './ShortcutsDialog.css'

interface Props {
  open: boolean
  onClose: () => void
}

type Label = Exclude<keyof Messages['shortcuts'], `hint${string}` | 'title' | 'toggle' | 'toggleHint' | 'off'>

// Every key the offers page answers to on desktop (§4.7), in the order of a triage pass.
const ROWS: readonly { keys: readonly string[]; label: Label }[] = [
  { keys: ['j', 'k'], label: 'nextPrevious' },
  { keys: ['Enter'], label: 'open' },
  { keys: ['Esc'], label: 'close' },
  { keys: ['o'], label: 'original' },
  { keys: ['i'], label: 'interested' },
  { keys: ['x'], label: 'dismiss' },
  { keys: ['/'], label: 'search' },
  { keys: ['?'], label: 'help' },
]

// Outside the dialog's box means the click landed on ::backdrop.
function onBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
}

// The list behind ? (§4.7) and the switch that turns shortcuts off (§5). A modal <dialog>
// like Sheet, but always the centred kind (it only opens on desktop), so it reports itself to
// the toast registry: toasts wait while it is open. Esc, X and the backdrop all close it
// through the dialog's own 'close' event; the browser hands focus back to the opener.
export function ShortcutsDialog({ open, onClose }: Props) {
  const { t } = useI18n()
  const enabled = useShortcutsEnabled()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const hintId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
    setDialogOpen(dialog, dialog.open)
    return () => setDialogOpen(dialog, false)
  }, [open])

  const handleClose = () => {
    if (ref.current) setDialogOpen(ref.current, false)
    if (open) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="shortcuts"
      aria-labelledby={titleId}
      onClose={handleClose}
      onClick={(event) => {
        if (onBackdrop(event)) ref.current?.close()
      }}
    >
      <div className="shortcuts__header">
        <h2 id={titleId} className="shortcuts__title">
          {t.shortcuts.title}
        </h2>
        <IconButton icon={X} aria-label={t.common.close} onClick={() => ref.current?.close()} />
      </div>
      <dl className="shortcuts__list">
        {ROWS.map(({ keys, label }) => (
          <div key={label} className="shortcuts__row">
            <dt className="shortcuts__keys">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dt>
            <dd>{t.shortcuts[label]}</dd>
          </div>
        ))}
      </dl>
      <label className="shortcuts__toggle">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          aria-describedby={hintId}
          onChange={(event) => setShortcutsEnabled(event.target.checked)}
        />
        <span>
          {t.shortcuts.toggle}
          <span id={hintId} className="shortcuts__hint">
            {t.shortcuts.toggleHint}
          </span>
        </span>
      </label>
    </dialog>
  )
}
