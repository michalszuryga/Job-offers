import { ChevronDown } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button, cx, Icon, TextField } from '../../components/ui'
import { useI18n } from '../../i18n'
import { statusAtLeast } from '../../lib/status'
import type { Offer } from '../../lib/types'
import type { Notes } from './useTracking'
import './TrackingForm.css'

interface Props {
  offer: Offer
  onSave: (notes: Notes) => Promise<void>
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// What you told the employer (§4.8). Collapsed until it matters: from Ready to apply on, or
// once something is noted. The status itself is not here; it saves the moment it is picked.
// Keyed per offer by its parent, so nothing typed for one offer shows on the next.
export function TrackingForm({ offer, onSave }: Props) {
  const { t } = useI18n()
  const formId = useId()
  // What is saved, as far as this form knows: the values it opened with, then its own saves.
  const [saved, setSaved] = useState({ rate: offer.applied_rate ?? '', notice: offer.notice_period ?? '' })
  const [rate, setRate] = useState(saved.rate)
  const [notice, setNotice] = useState(saved.notice)
  const [state, setState] = useState<SaveState>('idle')
  // Null follows the rule above; a click on the heading takes over from then on.
  const [toggled, setToggled] = useState<boolean | null>(null)

  const noted = saved.rate !== '' || saved.notice !== ''
  const open = toggled ?? (statusAtLeast(offer.application_status, 'READY_TO_APPLY') || noted)
  const dirty = rate !== saved.rate || notice !== saved.notice
  const busy = state === 'saving'

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!dirty || busy) return
    const notes: Notes = {}
    if (rate !== saved.rate) notes.rate = rate
    if (notice !== saved.notice) notes.notice = notice
    setState('saving')
    try {
      await onSave(notes)
      setSaved({ rate, notice })
      setState('saved')
    } catch {
      setState('error')
    }
  }

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value)
    if (state !== 'saving') setState('idle')
  }

  return (
    <section className="tracking">
      <h3 className="tracking__heading">
        <button
          type="button"
          className="tracking__toggle"
          aria-expanded={open}
          aria-controls={formId}
          onClick={() => setToggled(!open)}
        >
          <span className="tracking__title">{t.details.tracking}</span>
          <Icon icon={ChevronDown} size={20} className="tracking__chevron" />
        </button>
      </h3>
      {!open && (
        <p className="tracking__hint">
          {noted ? [saved.rate, saved.notice].filter(Boolean).join(' · ') : t.details.trackingHint}
        </p>
      )}
      <form id={formId} className="tracking__form" hidden={!open} onSubmit={save} noValidate>
        <div className="tracking__fields">
          <TextField
            label={t.details.rate}
            placeholder={t.details.ratePlaceholder}
            value={rate}
            autoComplete="off"
            onChange={(event) => edit(setRate)(event.target.value)}
          />
          <TextField
            label={t.details.notice}
            placeholder={t.details.noticePlaceholder}
            value={notice}
            autoComplete="off"
            onChange={(event) => edit(setNotice)(event.target.value)}
          />
        </div>
        <div className="tracking__footer">
          {/* aria-disabled, not disabled, while there is nothing to save: focus stays on the
              button after a save instead of dropping to <body>. */}
          <Button
            type="submit"
            loading={busy}
            aria-disabled={!dirty || undefined}
            className={cx('tracking__save', !dirty && !busy && 'tracking__save--idle')}
          >
            {t.details.save}
          </Button>
          {/* The view's one status region (§4.2), kept mounted so a change is announced. */}
          <p role="status" className={cx('tracking__status', state === 'error' && 'tracking__status--error')}>
            {state === 'saved' ? t.details.saved : state === 'error' ? t.details.saveError : ''}
          </p>
          {state === 'error' && (
            <Button variant="secondary" size="sm" onClick={() => void save()}>
              {t.common.retry}
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
