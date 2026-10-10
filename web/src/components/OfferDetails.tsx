import { useEffect, useState, type FormEvent } from 'react'
import { formatAge, formatSalary } from '../lib/format'
import { loadOfferDetails, saveTracking } from '../lib/offers'
import { STATUSES, type Offer, type OfferDetails, type Status } from '../lib/types'

interface Props {
  offer: Offer
  onClose: () => void
  onSaved: (offer: Offer) => void
}

function parseBreakdown(raw: string | null): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function OfferDetailsPanel({ offer, onClose, onSaved }: Props) {
  const [details, setDetails] = useState<OfferDetails | null>(null)
  const [status, setStatus] = useState<Status>(offer.application_status ?? 'TO_REVIEW')
  const [rate, setRate] = useState(offer.applied_rate ?? '')
  const [notice, setNotice] = useState(offer.notice_period ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    loadOfferDetails(offer.external_id).then(setDetails).catch(() => setDetails(null))
  }, [offer.external_id])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaveState('saving')
    try {
      await saveTracking(offer.external_id, status, rate, notice)
      onSaved({ ...offer, application_status: status, applied_rate: rate, notice_period: notice })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }

  const breakdown = parseBreakdown(details?.score_breakdown ?? null)
  const points = Object.entries(breakdown).filter(
    ([, value]) => typeof value === 'number' && value !== 0,
  ) as [string, number][]
  const matched = ['matched_roles', 'matched_technologies', 'matched_domains', 'matched_ai']
    .flatMap((key) => (Array.isArray(breakdown[key]) ? (breakdown[key] as string[]) : []))

  return (
    <aside className="details" aria-label="Offer details">
      <button className="link close" onClick={onClose}>
        ← Back to list
      </button>
      <h2>{offer.title}</h2>
      <p className="muted">
        {[offer.company, offer.location, offer.contract].filter(Boolean).join(' · ')}
      </p>
      <p>
        <strong>{formatSalary(offer) || 'Salary not listed'}</strong>
        <span className="muted"> · published {formatAge(offer.published_at)}</span>
      </p>
      <a className="button" href={offer.url} target="_blank" rel="noopener noreferrer">
        Open original offer
      </a>

      <form className="tracking" onSubmit={save}>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rate you quoted
          <input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 120 PLN/h B2B" />
        </label>
        <label>
          Notice period you gave
          <input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="e.g. 1 month" />
        </label>
        <button type="submit" disabled={saveState === 'saving'}>
          {saveState === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {saveState === 'saved' && <span role="status">Saved.</span>}
        {saveState === 'error' && (
          <span className="error" role="alert">
            Couldn't save. Try again.
          </span>
        )}
      </form>

      <section>
        <h3>Score {Math.round(offer.score ?? 0)}</h3>
        {points.length > 0 && (
          <ul className="points">
            {points.map(([name, value]) => (
              <li key={name}>
                {name.replaceAll('_', ' ')}: <strong>{value > 0 ? `+${value}` : value}</strong>
              </li>
            ))}
          </ul>
        )}
        {matched.length > 0 && <p className="muted">Matched: {matched.join(', ')}</p>}
      </section>

      <section>
        <h3>Description</h3>
        {/* Rendered as text, never HTML: scraped content is untrusted. */}
        <p className="description">{details ? details.description || 'No description.' : 'Loading…'}</p>
      </section>
    </aside>
  )
}
