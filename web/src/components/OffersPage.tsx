import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n, type Lang } from '../i18n'
import { applyFilters, formatAgo, formatSalary, timeOf } from '../lib/format'
import { loadDashboard } from '../lib/offers'
import { loadFilters, PUBLISHED_WINDOWS, saveFilters, type Filters, type PublishedWindow } from '../lib/prefs'
import { scoreBand } from '../lib/score'
import { sourceHealth } from '../lib/sources'
import { isStatus, STATUS_GROUPS, STATUS_META } from '../lib/status'
import type { Dashboard, Offer } from '../lib/types'
import { OfferDetailsPanel } from './OfferDetails'

// Card meta wraps between items, never inside "3 h ago" or a salary range, or before a "·".
const META_SEPARATOR = ' · '

// The company may need to wrap; salary, age and source are short and stay whole.
function cardMeta(offer: Offer, lang: Lang): { text: string; nowrap: boolean }[] {
  return [
    { text: offer.company ?? '', nowrap: false },
    { text: formatSalary(offer, lang), nowrap: true },
    { text: formatAgo(offer.published_at, lang), nowrap: true },
    { text: offer.source ?? '', nowrap: true },
  ].filter((item) => item.text)
}

type Load = { kind: 'loading' } | { kind: 'error'; detail: string } | { kind: 'ready'; dashboard: Dashboard }

export function OffersPage() {
  const { t, lang } = useI18n()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchDashboard = useCallback(() => {
    loadDashboard()
      .then((dashboard) => setLoad({ kind: 'ready', dashboard }))
      // Supabase errors are plain objects, not Error instances; either way the text is for <details> only.
      .catch((error: { message?: string }) => setLoad({ kind: 'error', detail: error?.message ?? String(error) }))
  }, [])

  useEffect(fetchDashboard, [fetchDashboard])
  useEffect(() => saveFilters(filters), [filters])

  const dashboard = load.kind === 'ready' ? load.dashboard : null
  const sources = useMemo(
    () => [...new Set((dashboard?.offers ?? []).map((o) => o.source ?? ''))].filter(Boolean).sort(),
    [dashboard],
  )
  const visible = useMemo(() => (dashboard ? applyFilters(dashboard.offers, filters) : []), [dashboard, filters])

  if (load.kind === 'error') {
    return (
      <div className="center load-error">
        <p role="alert">{t.offers.loadError}</p>
        <button
          onClick={() => {
            setLoad({ kind: 'loading' })
            fetchDashboard()
          }}
        >
          {t.common.tryAgain}
        </button>
        <details className="technical">
          <summary>{t.common.technicalDetails}</summary>
          <p>{load.detail}</p>
        </details>
      </div>
    )
  }
  if (!dashboard) return <p className="center muted">{t.offers.loading}</p>

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }))
  const selected = dashboard.offers.find((o) => o.external_id === selectedId) ?? null
  const failed = sourceHealth(dashboard.lastRun).failed

  function replaceOffer(updated: Offer) {
    setLoad((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            dashboard: {
              ...current.dashboard,
              offers: current.dashboard.offers.map((o) => (o.external_id === updated.external_id ? updated : o)),
            },
          }
        : current,
    )
  }

  return (
    <div className="layout">
      <section className="list-pane">
        <p className="muted fetch-line">
          {!dashboard.lastRun
            ? t.offers.noFetch
            : timeOf(dashboard.lastRun.finished_at) == null
              ? t.offers.lastFetchUndated(dashboard.newIds.size)
              : t.offers.lastFetch(formatAgo(dashboard.lastRun.finished_at, lang), dashboard.newIds.size)}
          {failed.length > 0 && (
            <span className="warn"> · {t.offers.failedSources(failed.map((r) => r.name).join(', '))}</span>
          )}
        </p>

        <div className="filters" role="group" aria-label={t.filters.label}>
          <select
            aria-label={t.filters.published}
            value={filters.window}
            onChange={(e) => update({ window: e.target.value as PublishedWindow })}
          >
            {PUBLISHED_WINDOWS.map((window) => (
              <option key={window} value={window}>
                {t.filters.windows[window]}
              </option>
            ))}
          </select>
          <select
            aria-label={t.filters.status}
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as Filters['status'] })}
          >
            <option value="ALL">{t.filters.allStatuses}</option>
            {STATUS_GROUPS.map((group) => (
              <optgroup key={group.key} label={t.statusGroups[group.key]}>
                {group.statuses.map((s) => (
                  <option key={s} value={s}>
                    {t.status[s]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select aria-label={t.filters.source} value={filters.source} onChange={(e) => update({ source: e.target.value })}>
            <option value="ALL">{t.filters.allSources}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="min-score">
            {t.filters.minScore}
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
            aria-label={t.filters.search}
            placeholder={t.filters.search}
            value={filters.query}
            onChange={(e) => update({ query: e.target.value })}
          />
        </div>

        <p className="muted count" aria-live="polite">
          {t.offers.count(visible.length, dashboard.offers.length)}
        </p>
        {dashboard.total > dashboard.offers.length && (
          <p className="muted limit-note">{t.offers.showingFirst(dashboard.offers.length)}</p>
        )}

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
                    {dashboard.newIds.has(offer.external_id) && <span className="badge-new">{t.offers.newBadge}</span>}
                    {offer.title}
                  </span>
                  <span className="muted">
                    {cardMeta(offer, lang).map((item, index) => (
                      <Fragment key={index}>
                        {index > 0 && META_SEPARATOR}
                        {item.nowrap ? <span className="nowrap">{item.text}</span> : item.text}
                      </Fragment>
                    ))}
                  </span>
                </span>
                {isStatus(offer.application_status) && offer.application_status !== 'TO_REVIEW' && (
                  <span className="status" data-tone={STATUS_META[offer.application_status].tone}>
                    {t.status[offer.application_status]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="center muted">{t.offers.empty}</p>}
      </section>

      {selected && (
        <OfferDetailsPanel
          key={selected.external_id}
          offer={selected}
          scoringProfile={dashboard.scoringProfile}
          onClose={() => setSelectedId(null)}
          onSaved={replaceOffer}
        />
      )}
    </div>
  )
}
