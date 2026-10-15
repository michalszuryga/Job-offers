import { Inbox, RefreshCw, SearchX } from 'lucide-react'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Kbd,
  ScoreBar,
  ScoreRing,
  Skeleton,
  SkeletonCard,
  StatusPill,
  VisuallyHidden,
} from '../../components/ui'
import { useI18n } from '../../i18n'
import { scoreBand, type CategoryKey } from '../../lib/score'
import { STATUSES } from '../../lib/types'
import { Example, Section, Specimen } from '../KitParts'
import { SCORES } from '../kitData'

// A "Why 75?" that adds up: 90 in categories, minus the stale penalty.
const BREAKDOWN: { key: CategoryKey; points: number; max: number }[] = [
  { key: 'role', points: 20, max: 25 },
  { key: 'technology', points: 20, max: 25 },
  { key: 'remote', points: 10, max: 10 },
  { key: 'contract', points: 10, max: 10 },
  { key: 'freshness', points: 5, max: 10 },
  { key: 'ai', points: 5, max: 5 },
  { key: 'language', points: 5, max: 5 },
  { key: 'salary_bonus', points: 15, max: 15 },
  { key: 'domain', points: 0, max: 10 },
]
const STALE = { points: -15, days: 10 }

const SHORTCUTS = [
  { keys: ['j', 'k'], label: 'Next / previous offer' },
  { keys: ['Enter'], label: 'Open details' },
  { keys: ['Esc'], label: 'Close details' },
  { keys: ['o'], label: 'Open the original offer' },
  { keys: ['i'], label: 'Mark as interested' },
  { keys: ['/'], label: 'Search' },
  { keys: ['?'], label: 'All shortcuts' },
]

const signed = (points: number) => (points > 0 ? `+${points}` : points < 0 ? `−${-points}` : '0')

export function DisplaySections() {
  const { t } = useI18n()
  const total = BREAKDOWN.reduce((sum, row) => sum + row.points, STALE.points)
  return (
    <>
      <Section
        id="badges"
        title="Badges and status pills"
        lede="Short static labels. The words carry the meaning; the tone only groups them at a glance."
      >
        <Specimen label="Badge tones">
          <Badge tone="new">New</Badge>
          <Badge tone="brand">Private beta</Badge>
          <Badge>Draft</Badge>
          <Badge tone="success">Saved</Badge>
          <Badge tone="info">Updated</Badge>
          <Badge tone="warning">1 source partial</Badge>
          <Badge tone="danger">Failed</Badge>
        </Specimen>
        <Specimen label="Counts">
          <Badge count>2</Badge>
          <Badge tone="new" count>
            12
          </Badge>
          <Badge tone="brand" count>
            128
          </Badge>
        </Specimen>
        <Specimen label="Status pills · all nine">
          {STATUSES.map((status) => (
            <StatusPill key={status} status={status} />
          ))}
        </Specimen>
      </Section>

      <Section
        id="score"
        title="Score"
        lede="Four bands plus “not scored”. The number is always full contrast, the band word is always there, and screen readers hear one phrase: “Match 75 of 100, Strong match”."
      >
        <Specimen label="Ring · 44 px, cards" className="kit-rings kit-rings--44">
          {SCORES.map((score) => (
            <ScoreRing key={score ?? 'none'} score={score} showBand />
          ))}
        </Specimen>
        <Specimen label="Ring · 64 px, details" className="kit-rings kit-rings--64">
          {SCORES.map((score) => (
            <ScoreRing key={score ?? 'none'} score={score} size={64} showBand />
          ))}
        </Specimen>
        <Specimen label={`Bars · “Why ${total}?”`} layout="stack">
          <ul className="kit-breakdown">
            {BREAKDOWN.map((row) => (
              <li key={row.key} className="kit-breakdown__row">
                <span className="kit-breakdown__label">{t.score.rows[row.key]}</span>
                <ScoreBar value={row.points} max={row.max} />
                <span className="kit-breakdown__points">{t.score.points(signed(row.points), row.max)}</span>
              </li>
            ))}
            <li className="kit-breakdown__row">
              <span className="kit-breakdown__label">{t.score.penalties.stale_offer_penalty(STALE.days)}</span>
              {/* Penalties have no bar: ScoreBar renders nothing below zero. */}
              <ScoreBar value={STALE.points} max={0} />
              <span className="kit-breakdown__points kit-breakdown__points--penalty">{signed(STALE.points)}</span>
            </li>
          </ul>
          <p className="kit-breakdown__total">{t.score.total(total, 100)}</p>
        </Specimen>
        <Specimen label="Bar tones" layout="stack">
          <ul className="kit-breakdown">
            {SCORES.filter((score) => score != null).map((score) => {
              const band = scoreBand(score)
              return (
                <li key={score} className="kit-breakdown__row">
                  <span className="kit-breakdown__label">{t.score.bands[band]}</span>
                  <ScoreBar value={score} max={100} tone={band === 'none' ? 'brand' : band} />
                  <span className="kit-breakdown__points">{score}</span>
                </li>
              )
            })}
          </ul>
        </Specimen>
      </Section>

      <Section id="loading" title="Skeleton" lede="Placeholders in the real sizes, hidden from screen readers. The shimmer stops under reduced motion.">
        <Specimen label="Shapes">
          <Skeleton width={160} />
          <Skeleton width={96} height={10} />
          <Skeleton shape="circle" width={44} />
          <Skeleton shape="block" width={120} />
        </Specimen>
        <Specimen label="Offer card" layout="stack" className="kit-narrow">
          <SkeletonCard />
          <SkeletonCard />
        </Specimen>
      </Section>

      <Section id="empty" title="Empty states" lede="Nothing here, and one clear way out.">
        <Specimen label="New view, filters" layout="grid" className="kit-frames">
          <EmptyState
            className="kit-frame"
            icon={Inbox}
            headingLevel={3}
            title="No new offers from the last fetch"
            actions={<Button variant="secondary">Show last 3 days</Button>}
          >
            Next fetch today around 12:00.
          </EmptyState>
          <EmptyState
            className="kit-frame"
            icon={SearchX}
            headingLevel={3}
            title={t.offers.empty}
            actions={<Button variant="secondary">Clear filters</Button>}
          />
        </Specimen>
      </Section>

      <Section
        id="callouts"
        title="Callouts"
        lede="Inline messages. Each tone has its own icon shape, and raw errors fold away under “Technical details”."
      >
        <Specimen label="Tones" layout="stack">
          <Callout tone="info" title={t.offers.showingFirst(2000)}>
            Narrow the filters to see the rest.
          </Callout>
          <Callout tone="success" title={t.details.saved}>
            Your rate and notice period are stored with the offer.
          </Callout>
          <Callout
            tone="warning"
            title="2 sources failed"
            details={'Board A: HTTP 403 Forbidden\nBoard B: ReadTimeout after 30.0 s'}
          >
            Offers from the other boards are up to date.
          </Callout>
          <Callout
            tone="danger"
            title={t.offers.loadError}
            actions={
              <Button size="sm" variant="secondary" icon={RefreshCw}>
                {t.common.tryAgain}
              </Button>
            }
            details={'TypeError: Failed to fetch\n    at loadDashboard (offers.ts:88:11)'}
          />
        </Specimen>
      </Section>

      <Section id="keys" title="Keys and hidden text" lede="Keycaps for shortcut hints, and text only screen readers get.">
        <Specimen label="Kbd" layout="stack">
          <dl className="kit-shortcuts">
            {SHORTCUTS.map(({ keys, label }) => (
              <div key={label} className="kit-shortcuts__row">
                <dt className="kit-shortcuts__keys">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </Specimen>
        <Specimen label="Visually hidden">
          <Example caption="Read as “Score 75 out of 100”">
            <span className="kit-hidden-demo">
              Score 75
              <VisuallyHidden> out of 100</VisuallyHidden>
            </span>
          </Example>
        </Specimen>
      </Section>
    </>
  )
}
