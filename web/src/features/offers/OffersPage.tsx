import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListSkeleton } from '../../components/shell/BootSkeleton'
import { cx } from '../../components/ui'
import { useI18n } from '../../i18n'
import { newOffers, reviewedCount } from '../../lib/batch'
import { applyFilters, sortOffers } from '../../lib/format'
import { loadFilters, saveFilters, type Filters } from '../../lib/prefs'
import { clearView, closeOffer, useEscapeToClose, useOfferParam, viewFrom } from '../../lib/router'
import { scoringFrom } from '../../lib/score'
import { sourceHealth } from '../../lib/sources'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { ActiveFilterChips } from './ActiveFilterChips'
import { BatchHeader } from './BatchHeader'
import { EmptyList, LoadError } from './ListStates'
import { OfferList } from './OfferList'
import { TodaySummary } from './TodaySummary'
import { Toolbar } from './Toolbar'
import { useDashboard } from './useDashboard'
import './OffersPage.css'

// From here up the toolbar is inline and details open beside the list (§4.7). Layouts that
// differ are mounted per breakpoint, never just hidden with CSS.
const WIDE = '(min-width: 1024px)'

// Not needed for the list's first paint, so each is its own chunk (check-bundle budget).
// Details are fetched right after the list shows, so opening one doesn't wait.
const loadDetails = () => import('../../components/OfferDetails')
const OfferDetailsPanel = lazy(() => loadDetails().then((m) => ({ default: m.OfferDetailsPanel })))
const FilterSheet = lazy(() => import('./FilterSheet').then((m) => ({ default: m.FilterSheet })))
const SourcesSheet = lazy(() =>
  import('../../components/shell/SourcesSheet').then((m) => ({ default: m.SourcesSheet })),
)

type SheetName = 'filters' | 'sources'

function initialFilters(): Filters {
  const saved = loadFilters()
  // ?view=new, the e-mail's link, opens the New view; the param is dropped once read.
  return viewFrom(location.search) === 'new' ? { ...saved, window: 'new' } : saved
}

export function OffersPage() {
  const { t } = useI18n()
  const wide = useMediaQuery(WIDE)
  const { load, seen, retry, refresh, promote, replaceOffer } = useDashboard()
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [sheet, setSheet] = useState<SheetName | null>(null)
  // A sheet's chunk loads on its first open; it then stays mounted, so closing can animate.
  const [sheetsUsed, setSheetsUsed] = useState<ReadonlySet<SheetName>>(() => new Set())
  // The open offer is ?offer= in the URL (§4.1), so back and Esc close it through history.
  const { offerId: selectedId } = useOfferParam()
  useEscapeToClose(selectedId != null, closeOffer)

  useEffect(clearView, [])
  useEffect(() => saveFilters(filters), [filters])

  const update = useCallback((patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch })), [])
  const openSheet = (name: SheetName) => {
    setSheetsUsed((used) => (used.has(name) ? used : new Set(used).add(name)))
    setSheet(name)
  }
  const closeSheet = useCallback(() => setSheet(null), [])

  const dashboard = load.kind === 'ready' ? load.dashboard : null
  const batch = useMemo(() => (dashboard ? newOffers(dashboard.offers, dashboard.newIds) : []), [dashboard])
  const reviewed = reviewedCount(batch, seen)
  const scoringProfile = dashboard?.scoringProfile ?? null
  const salaryCfg = useMemo(() => scoringFrom(scoringProfile).salary_bonus ?? {}, [scoringProfile])
  const visible = useMemo(
    () =>
      dashboard
        ? sortOffers(applyFilters(dashboard.offers, filters, { newIds: dashboard.newIds }), filters.sort, salaryCfg)
        : [],
    [dashboard, filters, salaryCfg],
  )
  const sources = useMemo(
    () => [...new Set((dashboard?.offers ?? []).map((o) => o.source ?? ''))].filter(Boolean).sort(),
    [dashboard],
  )
  const selected = dashboard?.offers.find((o) => o.external_id === selectedId) ?? null

  // "(2) JOffers": the New set still to review (§4.5).
  const unread = batch.length - reviewed
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) JOffers` : 'JOffers'
  }, [unread])
  useEffect(
    () => () => {
      document.title = 'JOffers'
    },
    [],
  )

  // Opening an offer that is still To review marks it Reviewed, once per opening (§4.5).
  const promotedFor = useRef<string | null>(null)
  useEffect(() => {
    if (selectedId == null) {
      promotedFor.current = null
      return
    }
    if (!selected || promotedFor.current === selectedId) return
    promotedFor.current = selectedId
    if ((selected.application_status ?? 'TO_REVIEW') === 'TO_REVIEW') promote(selected)
  }, [selectedId, selected, promote])

  const ready = dashboard != null
  useEffect(() => {
    if (ready) void loadDetails()
  }, [ready])

  if (load.kind === 'error') {
    return (
      <div className="offers-error">
        <LoadError detail={load.detail} onRetry={retry} />
      </div>
    )
  }
  if (load.kind !== 'ready' || !dashboard) return <ListSkeleton label={t.offers.loading} />

  const health = sourceHealth(dashboard.lastRun)
  const openSources = () => openSheet('sources')

  const header = (
    <div className="offers-band offers-page__batch">
      <BatchHeader
        lastRun={dashboard.lastRun}
        newCount={batch.length}
        reviewed={reviewed}
        health={health}
        refreshing={load.refreshing}
        onRefresh={refresh}
        onSources={openSources}
      />
    </div>
  )
  const toolbar = (
    <Toolbar
      wide={wide}
      filters={filters}
      onChange={update}
      sources={sources}
      onOpenFilters={() => openSheet('filters')}
    />
  )
  const list = (
    <>
      {load.refreshError && <LoadError detail={load.refreshError} onRetry={refresh} />}
      <p className="offers-count" aria-live="polite">
        {t.offers.count(visible.length, dashboard.offers.length)}
      </p>
      {dashboard.total > dashboard.offers.length && (
        <p className="offers-limit">{t.offers.showingFirst(dashboard.offers.length)}</p>
      )}
      {visible.length > 0 ? (
        <OfferList
          offers={visible}
          newIds={dashboard.newIds}
          seen={seen}
          selectedId={wide ? selectedId : null}
          salaryCfg={salaryCfg}
        />
      ) : (
        <EmptyList filters={filters} batchSize={batch.length} onChange={update} />
      )}
    </>
  )
  const details = selected && (
    <Suspense fallback={null}>
      <OfferDetailsPanel
        key={selected.external_id}
        offer={selected}
        scoringProfile={dashboard.scoringProfile}
        onClose={closeOffer}
        onSaved={replaceOffer}
      />
    </Suspense>
  )

  return (
    <div className={cx('offers-page', wide && 'offers-page--wide')}>
      {wide ? (
        <>
          {toolbar}
          {header}
          <div className="offers-grid offers-band">
            <div className="offers-pane">{list}</div>
            {details || (
              <TodaySummary
                offers={dashboard.offers}
                batch={batch}
                reviewed={reviewed}
                health={health}
                lastRun={dashboard.lastRun}
                onSources={openSources}
              />
            )}
          </div>
        </>
      ) : (
        <>
          {header}
          {toolbar}
          <ActiveFilterChips filters={filters} onChange={update} />
          <div className="offers-pane offers-band">{list}</div>
          {details}
        </>
      )}

      {/* The phone's; from 1024 px the same controls are inline in the toolbar. */}
      {!wide && sheetsUsed.has('filters') && (
        <Suspense fallback={null}>
          <FilterSheet
            open={sheet === 'filters'}
            onClose={closeSheet}
            filters={filters}
            onChange={update}
            sources={sources}
            count={visible.length}
          />
        </Suspense>
      )}
      {sheetsUsed.has('sources') && (
        <Suspense fallback={null}>
          <SourcesSheet open={sheet === 'sources'} onClose={closeSheet} run={dashboard.lastRun} />
        </Suspense>
      )}
    </div>
  )
}
