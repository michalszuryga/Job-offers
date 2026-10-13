import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ListSkeleton } from '../../components/shell/BootSkeleton'
import { cx } from '../../components/ui'
import { useI18n } from '../../i18n'
import { newOffers, reviewedCount } from '../../lib/batch'
import { useDataSource } from '../../lib/dataSource'
import { applyFilters, sortOffers } from '../../lib/format'
import { DEFAULT_FILTERS, loadFilters, saveFilters, type Filters } from '../../lib/prefs'
import { clearView, closeOffer, openOffer, useEscapeToClose, useKeyShortcut, useOfferParam, viewFrom } from '../../lib/router'
import { scoringFrom } from '../../lib/score'
import { setShortcutsHelp, useShortcutsHelp } from '../../lib/shortcuts'
import { sourceHealth } from '../../lib/sources'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { ActiveFilterChips } from './ActiveFilterChips'
import { BatchHeader } from './BatchHeader'
import { EmptyList, LoadError } from './ListStates'
import { OfferList } from './OfferList'
import { listPosition } from './position'
import { TodaySummary } from './TodaySummary'
import { Toolbar } from './Toolbar'
import { useDashboard } from './useDashboard'
import './OffersPage.css'

// From here up the toolbar is inline and details open beside the list (§4.7). Layouts that
// differ are mounted per breakpoint, never just hidden with CSS.
const WIDE = '(min-width: 1024px)'

// Not needed for the list's first paint, so each is its own chunk (check-bundle budget).
// Details are fetched right after the list shows, so opening one doesn't wait.
const loadDetails = () => import('./DetailsView')
const DetailsView = lazy(() => loadDetails().then((m) => ({ default: m.DetailsView })))
const FilterSheet = lazy(() => import('./FilterSheet').then((m) => ({ default: m.FilterSheet })))
const SourcesSheet = lazy(() =>
  import('../../components/shell/SourcesSheet').then((m) => ({ default: m.SourcesSheet })),
)
const ShortcutsDialog = lazy(() => import('./ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })))

type SheetName = 'filters' | 'sources'

// The card of an offer, if the list shows it (OfferCard's data-offer).
function cardOf(id: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('.offer[data-offer]')].find((card) => card.dataset.offer === id) ?? null
}

// / puts the cursor in the toolbar's search (FilterPanel), with what is there selected.
function focusSearch() {
  const search = document.querySelector<HTMLInputElement>('.offers-page input[type="search"]')
  search?.focus()
  search?.select()
}

const openHelp = () => setShortcutsHelp(true)

// The demo starts from the defaults and remembers nothing (DataSource.persistent).
function initialFilters(persistent: boolean): Filters {
  const saved = persistent ? loadFilters() : { ...DEFAULT_FILTERS }
  // ?view=new, the e-mail's link, opens the New view; the param is dropped once read.
  return viewFrom(location.search) === 'new' ? { ...saved, window: 'new' } : saved
}

export function OffersPage() {
  const { t } = useI18n()
  const wide = useMediaQuery(WIDE)
  const { persistent } = useDataSource()
  const { load, seen, retry, refresh, promote, updateOffer, getOffer } = useDashboard()
  const [filters, setFilters] = useState<Filters>(() => initialFilters(persistent))
  const [sheet, setSheet] = useState<SheetName | null>(null)
  // A sheet's chunk loads on its first open; it then stays mounted, so closing can animate.
  const [sheetsUsed, setSheetsUsed] = useState<ReadonlySet<SheetName>>(() => new Set())
  // The open offer is ?offer= in the URL (§4.1), so back and Esc close it through history.
  const { offerId: selectedId } = useOfferParam()
  useEscapeToClose(selectedId != null, closeOffer)

  useEffect(clearView, [])
  useEffect(() => {
    if (persistent) saveFilters(filters)
  }, [filters, persistent])

  const update = useCallback((patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch })), [])
  const openSheet = (name: SheetName) => {
    setSheetsUsed((used) => (used.has(name) ? used : new Set(used).add(name)))
    setSheet(name)
  }
  const closeSheet = useCallback(() => setSheet(null), [])
  // The shortcuts dialog (?, the account menu, the summary's hints): loaded on first open.
  const helpOpen = useShortcutsHelp()
  const [helpUsed, setHelpUsed] = useState(false)
  if (helpOpen && !helpUsed) setHelpUsed(true)
  const closeHelp = useCallback(() => setShortcutsHelp(false), [])

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

  // "3 / 12", previous/next and "Not for me" walk the list as filtered and sorted now.
  const position = useMemo(
    () => selected && listPosition(visible, selected, (offers) => sortOffers(offers, filters.sort, salaryCfg)),
    [visible, selected, filters.sort, salaryCfg],
  )

  // Keyboard triage on desktop (§4.7). j/k walk the list as it is now, starting with its first
  // offer when none is open; openOffer pushes that first one and replaces after it, so back
  // still lands on the list. Enter is the focused card's own link, Esc useEscapeToClose, and
  // o, i and x belong to the open offer (DetailsView).
  const firstId = visible[0]?.external_id ?? null
  const step = useCallback(
    (id: string | null | undefined) => {
      const target = selectedId == null ? firstId : id
      if (target == null) return
      openOffer(target)
      // The pane is sticky; the card it belongs to should stay in sight beside it.
      cardOf(target)?.scrollIntoView({ block: 'nearest' })
    },
    [selectedId, firstId],
  )
  const triage = wide && dashboard != null
  useKeyShortcut('j', triage, useCallback(() => step(position?.nextId), [step, position]))
  useKeyShortcut('k', triage, useCallback(() => step(position?.previousId), [step, position]))
  useKeyShortcut('/', triage, focusSearch)
  useKeyShortcut('?', triage, openHelp)

  // Closing hands focus back to the card of the offer that was open (§4.8), when it was
  // inside the details: a click elsewhere (the logo) keeps its own. On phones the details
  // view has restored the scroll position by now, and the list is no longer inert.
  const shownId = useRef<string | null>(null)
  useLayoutEffect(() => {
    const previous = shownId.current
    shownId.current = selectedId
    if (previous == null || selectedId != null) return
    const active = document.activeElement
    if (active == null || active === document.body) cardOf(previous)?.focus()
  }, [selectedId])

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
      <DetailsView
        offer={selected}
        wide={wide}
        position={position}
        scoringProfile={dashboard.scoringProfile}
        scoresRefreshedOn={dashboard.scoresRefreshedOn}
        salaryCfg={salaryCfg}
        getOffer={getOffer}
        updateOffer={updateOffer}
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
      {wide && helpUsed && (
        <Suspense fallback={null}>
          <ShortcutsDialog open={helpOpen} onClose={closeHelp} />
        </Suspense>
      )}
    </div>
  )
}
