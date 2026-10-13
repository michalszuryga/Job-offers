import { Building2, Clock, FileText, Globe, MapPin, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCoverPage } from '../../components/shell/pageCover'
import { Button, Callout, cx, Icon, VisuallyHidden } from '../../components/ui'
import { useI18n } from '../../i18n'
import { formatAgo, formatDateTime, timeOf } from '../../lib/format'
import { useDataSource } from '../../lib/dataSource'
import { closeOffer, openOffer, useKeyShortcut } from '../../lib/router'
import type { SalaryConfig } from '../../lib/salary'
import { parseBreakdown, scoringFrom } from '../../lib/score'
import type { Offer, OfferDetails, ScoringProfile, Status } from '../../lib/types'
import { ActionBar } from './ActionBar'
import { DetailsHeader } from './DetailsHeader'
import { Description } from './Description'
import { candidateCasing, salaryThreshold } from './match'
import { MatchCard } from './MatchCard'
import type { ListPosition } from './position'
import { SalaryBlock } from './SalaryBlock'
import { TrackingForm } from './TrackingForm'
import { useTracking, type GetOffer, type UpdateOffer } from './useTracking'
import './DetailsView.css'

interface Props {
  // The open offer as the list has it (status changes show there at once).
  offer: Offer
  // ≥ 1024 px: the sticky pane beside the list. Below: a full-screen view over it.
  wide: boolean
  position: ListPosition | null
  scoringProfile: ScoringProfile | null
  scoresRefreshedOn: string | null
  salaryCfg: SalaryConfig
  getOffer: GetOffer
  updateOffer: UpdateOffer
}

type Loaded = { id: string; attempt: number; details: OfferDetails | 'error' }

function Fact({ icon, label, children }: { icon: LucideIcon; label?: string; children: ReactNode }) {
  return (
    <li className="details__fact">
      <Icon icon={icon} className="details__fact-icon" />
      {label && <VisuallyHidden>{label}: </VisuallyHidden>}
      {children}
    </li>
  )
}

// The offer details (§4.8). One component in two containers: on phones a fixed full-screen
// view (not a dialog) over the list, which stays mounted but inert, slides in, and hands
// focus back to the card on close (OffersPage); on desktop the sticky right pane. Either way
// the aside is its own scroller, so it carries its own scroll padding (DetailsView.css).
export function DetailsView({
  offer,
  wide,
  position,
  scoringProfile,
  scoresRefreshedOn,
  salaryCfg,
  getOffer,
  updateOffer,
}: Props) {
  const { t, lang } = useI18n()
  const id = offer.external_id
  const asideRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const { changeStatus, saveNotes } = useTracking(getOffer, updateOffer)
  const { loadOfferDetails } = useDataSource()

  useEffect(() => {
    let current = true
    loadOfferDetails(id).then(
      (details) => current && setLoaded({ id, attempt, details }),
      () => current && setLoaded({ id, attempt, details: 'error' }),
    )
    return () => {
      current = false
    }
  }, [id, attempt, loadOfferDetails])

  // Phone: the page behind goes inert and stops scrolling; its scroll position comes back on
  // close, whatever the browser did meanwhile.
  useCoverPage(!wide)
  useLayoutEffect(() => {
    if (wide) return
    const root = document.documentElement
    const scrollY = window.scrollY
    root.classList.add('details-open')
    return () => {
      root.classList.remove('details-open')
      window.scrollTo(0, scrollY)
    }
  }, [wide])

  // Focus starts on the title when the view covers the list, or when whatever opened it is
  // gone (desktop's "Open best match"). A card clicked beside the pane keeps it.
  useLayoutEffect(() => {
    const active = document.activeElement
    if (!wide || active == null || active === document.body) titleRef.current?.focus({ preventScroll: true })
  }, [wide])

  // Another offer (previous/next, or a card beside the pane) starts at its top.
  useLayoutEffect(() => {
    asideRef.current?.scrollTo({ top: 0 })
  }, [id])

  const current = loaded && loaded.id === id && loaded.attempt === attempt ? loaded.details : null
  const details = current === 'error' ? null : current
  const breakdown = useMemo(() => (details ? parseBreakdown(details.score_breakdown) : null), [details])
  const scoring = useMemo(() => scoringFrom(scoringProfile), [scoringProfile])
  const casing = useMemo(() => candidateCasing(scoringProfile), [scoringProfile])
  const onStatus = (status: Status) => changeStatus(id, status)

  // "Not for me" (§4.9), button or x: the one status change that moves on, to the next offer
  // in the list as it is now, replacing this history entry so back still lands on the list.
  // After the last offer it closes. Undo puts the status back and stays where it is.
  const nextId = position?.nextId ?? null
  const dismiss = useCallback(() => {
    changeStatus(id, 'DISMISSED')
    if (nextId != null) openOffer(nextId)
    else closeOffer()
  }, [changeStatus, id, nextId])
  const dismissable = offer.application_status !== 'DISMISSED'
  useKeyShortcut('x', dismissable, dismiss)
  const onDismiss = dismissable ? dismiss : null
  const published = timeOf(offer.published_at) != null

  const aside = (
    <aside
      ref={asideRef}
      className={cx('details', wide ? 'details--pane' : 'details--view')}
      aria-label={t.details.label}
    >
      <DetailsHeader
        wide={wide}
        position={position}
        status={offer.application_status}
        onStatus={onStatus}
        onDismiss={onDismiss}
        url={offer.url}
      />
      {/* Keyed: what one offer loaded, typed or unfolded never shows on the next. */}
      <div key={id} className="details__body">
        <div className="details__hero">
          {/* Focused programmatically only; the heading itself is not a control. */}
          <h2 ref={titleRef} tabIndex={-1} className="details__title">
            {offer.title}
          </h2>
          <ul className="details__facts">
            {offer.company && (
              <Fact icon={Building2} label={t.details.company}>
                {offer.company}
              </Fact>
            )}
            {offer.location && (
              <Fact icon={MapPin} label={t.details.location}>
                {offer.location}
              </Fact>
            )}
            {offer.contract && (
              <Fact icon={FileText} label={t.details.contract}>
                {offer.contract}
              </Fact>
            )}
            <Fact icon={Clock}>
              {published ? (
                <time dateTime={offer.published_at ?? undefined} title={formatDateTime(offer.published_at, lang)}>
                  {t.details.published(formatAgo(offer.published_at, lang))}
                </time>
              ) : (
                t.details.publishedUnknown
              )}
            </Fact>
            {offer.source && (
              <Fact icon={Globe} label={t.details.source}>
                {offer.source}
              </Fact>
            )}
          </ul>
          <SalaryBlock offer={offer} salaryCfg={salaryCfg} threshold={breakdown ? salaryThreshold(breakdown) : null} />
        </div>

        {current === 'error' && (
          <Callout
            tone="danger"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t.common.tryAgain}
              </Button>
            }
          >
            {t.details.loadError}
          </Callout>
        )}

        <MatchCard
          score={offer.score}
          breakdown={current === 'error' ? {} : breakdown}
          scoring={scoring}
          casing={casing}
          scoresRefreshedOn={scoresRefreshedOn}
        />
        <TrackingForm offer={offer} onSave={(notes) => saveNotes(id, notes)} />
        {current !== 'error' && <Description text={details ? (details.description ?? '') : null} clamp={!wide} />}
      </div>
      {!wide && (
        <ActionBar status={offer.application_status} onStatus={onStatus} onDismiss={onDismiss} url={offer.url} />
      )}
    </aside>
  )

  // The phone view renders outside the page, which goes inert under it (useCoverPage).
  return wide ? aside : createPortal(aside, document.body)
}
