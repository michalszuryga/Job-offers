import { useEffect, useMemo, useState } from 'react'
import { applyFilters, DEFAULT_FILTERS, formatAge, formatSalary, WINDOW_LABELS, type Filters, type PublishedWindow } from '../lib/format'
import { loadDashboard } from '../lib/offers'
import { scoreBand } from '../lib/score'
import { STATUSES, type Dashboard, type Offer } from '../lib/types'
import { OfferDetailsPanel } from './OfferDetails'

const FILTERS_KEY = 'joffers-filters'

// Card meta wraps between items, never inside "3 h ago" or before a "·".
const META_SEPARATOR = '\u00a0· '
const unbroken = (text: string) => text.replaceAll(' ', '\u00a0')

function storedFilters(): Filters {
  try {
    return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}') }
  } catch {
    return DEFAULT_FILTERS
  }
}

export function OffersPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [loadError, setLoadError] = useState('')
  const [filters, setFilters] = useState<Filters>(storedFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    loadDashboard().then(setDashboard).catch((error: Error) => setLoadError(error.message))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
    } catch {
      // Private mode or blocked storage: filters just won't be remembered.
    }
  }, [filters])

  const sources = useMemo(
    () => [...new Set((dashboard?.offers ?? []).map((o) => o.source ?? ''))].filter(Boolean).sort(),
    [dashboard],
  )
  const visible = useMemo(() => (dashboard ? applyFilters(dashboard.offers, filters) : []), [dashboard, filters])

  if (loadError) return <p className="center error">Couldn't load offers: {loadError}</p>
  if (!dashboard) return <p className="center muted">Loading offers…</p>

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const selected = dashboard.offers.find((o) => o.external_id === selectedId) ?? null
  const failed = (dashboard.lastRun?.results ?? []).filter((r) => r.error && r.error_type !== 'OfferParseError')

  function replaceOffer(updated: Offer) {
    setDashboard((current) =>
      current && {
        ...current,
        offers: current.offers.map((o) => (o.external_id === updated.external_id ? updated : o)),
      },
    )
  }

  return (
    <div className="layout">
      <section className="list-pane">
        <p className="muted fetch-line">
          {dashboard.lastRun
            ? `Last fetch ${formatAge(dashboard.lastRun.finished_at)} · ${dashboard.newIds.size} new`
            : 'No fetch yet'}
          {failed.length > 0 && <span className="warn"> · failed: {failed.map((r) => r.name).join(', ')}</span>}
        </p>

        <div className="filters" role="group" aria-label="Filters">
          <select
            aria-label="Published"
            value={filters.window}
            onChange={(e) => update({ window: e.target.value as PublishedWindow })}
          >
            {Object.entries(WINDOW_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as Filters['status'] })}
          >
            <option value="ALL">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select aria-label="Source" value={filters.source} onChange={(e) => update({ source: e.target.value })}>
            <option value="ALL">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="min-score">
            Min score
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={filters.minScore}
              onChange={(e) => update({ minScore: Number(e.target.value) || 0 })}
            />
          </label>
          <input
            type="search"
            aria-label="Search title or company"
            placeholder="Search title or company"
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
        </div>

        <p className="muted count" aria-live="polite">
          {visible.length} of {dashboard.offers.length} offers
        </p>

        <ul className="offers">
          {visible.map((offer) => (
            <li key={offer.external_id}>
              <button
                className={`offer${offer.external_id === selectedId ? ' selected' : ''}`}
                onClick={() => setSelectedId(offer.external_id)}
              >
                <span className="score" data-band={scoreBand(offer.score)}>
                  {offer.score == null ? '–' : Math.round(offer.score)}
                </span>
                <span className="offer-main">
                  <span className="offer-title">
                    {dashboard.newIds.has(offer.external_id) && <span className="badge-new">NEW</span>}
                    {offer.title}
                  </span>
                  <span className="muted">
                    {[offer.company, unbroken(formatSalary(offer)), unbroken(formatAge(offer.published_at)), offer.source]
                      .filter(Boolean)
                      .join(META_SEPARATOR)}
                  </span>
                </span>
                {offer.application_status && offer.application_status !== 'TO_REVIEW' && (
                  <span className="status">{offer.application_status}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="center muted">No offers match these filters.</p>}
      </section>

      {selected && (
        <OfferDetailsPanel
          key={selected.external_id}
          offer={selected}
          onClose={() => setSelectedId(null)}
          onSaved={replaceOffer}
        />
      )}
    </div>
  )
}
