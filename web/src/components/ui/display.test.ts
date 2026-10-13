import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { jsx } from 'react/jsx-runtime'
import { describe, expect, test } from 'vitest'
import { I18nProvider, type Lang } from '../../i18n'
import { STATUSES } from '../../lib/types'
import { Badge } from './Badge'
import { Callout } from './Callout'
import { EmptyState } from './EmptyState'
import { ScoreBar } from './ScoreBar'
import { ScoreRing } from './ScoreRing'
import { Skeleton, SkeletonCard } from './Skeleton'
import { StatusPill } from './StatusPill'

// Display components of the kit, rendered to markup: what assistive tech gets, and the
// geometry the CSS can't check. Looks are covered by kit.spec (axe) and the screens.

// What <Type {...props} /> compiles to, typed; this file can't hold JSX (vitest runs *.test.ts).
const el = <P extends object>(type: (props: P) => ReactNode, props: P): ReactElement => jsx(type, props)

const render = (element: ReactElement, lang: Lang = 'en') =>
  renderToStaticMarkup(el(I18nProvider, { lang, children: element }))

// The painted arc of a ring: dash plus one stroke of round caps, as a share of the circle.
function arcShare(html: string): number {
  const arc = html.match(/class="ui-score-ring__arc"[^>]*>/)?.[0]
  if (!arc) return 0
  const r = Number(arc.match(/ r="([\d.]+)"/)?.[1])
  const stroke = Number(arc.match(/stroke-width="([\d.]+)"/)?.[1])
  const dash = Number(arc.match(/stroke-dasharray="([\d.]+) /)?.[1])
  return (dash + stroke) / (2 * Math.PI * r)
}

describe('StatusPill', () => {
  test.each(STATUSES)('%s shows its label, never the enum', (status) => {
    const html = render(el(StatusPill, { status }))
    expect(html).toContain('ui-status-pill__dot')
    expect(html).not.toContain(`>${status}<`)
  })

  test('labels and tones follow §2.4', () => {
    expect(render(el(StatusPill, { status: 'APPLIED' }))).toMatch(/ui-status-pill--info.*>Applied</)
    expect(render(el(StatusPill, { status: 'WITHDRAWN' }))).toContain('ui-status-pill--outline')
    expect(render(el(StatusPill, { status: 'APPLIED' }), 'pl')).toContain('>Wysłano<')
    expect(render(el(StatusPill, { status: 'DISMISSED' }))).toMatch(/ui-status-pill--outline.*>Not for me</)
    expect(render(el(StatusPill, { status: 'DISMISSED' }), 'pl')).toContain('>Nie dla mnie<')
  })

  test('an unknown or missing status renders nothing', () => {
    expect(render(el(StatusPill, { status: 'ARCHIVED' }))).toBe('')
    expect(render(el(StatusPill, { status: null }))).toBe('')
  })
})

describe('ScoreRing', () => {
  test('screen readers get one phrase; the drawn number is hidden', () => {
    const html = render(el(ScoreRing, { score: 75 }))
    expect(html).toContain('<span class="visually-hidden">Match 75 of 100, Strong match</span>')
    expect(html).toContain('<span class="ui-score-ring__value" aria-hidden="true">75</span>')
    expect(html).toContain('ui-score-ring--strong')
  })

  test('the band word beside the ring is not read twice', () => {
    const html = render(el(ScoreRing, { score: 82, size: 64, showBand: true }))
    expect(html).toContain('<span class="ui-score-ring__band" aria-hidden="true">Top match</span>')
    expect(html).toContain('ui-score-ring--64')
  })

  test('the number is rounded and banded as shown', () => {
    const html = render(el(ScoreRing, { score: 64.6 }))
    expect(html).toContain('Match 65 of 100, Strong match')
  })

  test.each([25, 50, 75, 100])('arc length is proportional to %i', (score) => {
    expect(arcShare(render(el(ScoreRing, { score })))).toBeCloseTo(score / 100, 2)
    expect(arcShare(render(el(ScoreRing, { score, size: 64 })))).toBeCloseTo(score / 100, 2)
  })

  test('zero draws the track only', () => {
    const html = render(el(ScoreRing, { score: 0 }))
    expect(html).not.toContain('ui-score-ring__arc')
    expect(html).toContain('Match 0 of 100, Low match')
  })

  test('unscored: dashed ring, a dash, and the band word', () => {
    const html = render(el(ScoreRing, { score: null }))
    expect(html).toContain('ui-score-ring--none')
    expect(html).not.toContain('ui-score-ring__arc')
    expect(html).toMatch(/ui-score-ring__track"[^>]*stroke-dasharray=/)
    expect(html).toContain('aria-hidden="true">–</span>')
    expect(html).toContain('<span class="visually-hidden">Not scored</span>')
    expect(render(el(ScoreRing, { score: null }), 'pl')).toContain('>Bez oceny<')
  })
})

describe('ScoreBar', () => {
  test('fills its share of the maximum, clamped, and stays out of the a11y tree', () => {
    expect(render(el(ScoreBar, { value: 10, max: 20 }))).toMatch(/style="--fill:0.5" aria-hidden="true"/)
    expect(render(el(ScoreBar, { value: 30, max: 20 }))).toContain('--fill:1"')
    expect(render(el(ScoreBar, { value: 0, max: 20 }))).toContain('--fill:0"')
    expect(render(el(ScoreBar, { value: 5, max: 0 }))).toContain('--fill:0"')
  })

  test('penalties have no bar', () => {
    expect(render(el(ScoreBar, { value: -15, max: 15 }))).toBe('')
    expect(render(el(ScoreBar, { value: Number.NaN, max: 15 }))).toBe('')
  })
})

describe('Callout', () => {
  test('is never a live region itself (the view keeps one mounted around it)', () => {
    const html = render(el(Callout, { tone: 'danger', title: 'Saved', details: 'x' }))
    expect(html).not.toContain('role=')
    expect(html).not.toContain('aria-live')
  })

  test('raw text goes under "Technical details" as a text node', () => {
    const html = render(el(Callout, { tone: 'danger', details: '<b>500</b> upstream' }))
    expect(html).toContain('Technical details</summary>')
    expect(html).toContain('&lt;b&gt;500&lt;/b&gt; upstream')
    expect(render(el(Callout, { details: 'x' }), 'pl')).not.toContain('Technical details')
  })

  test('no details, no disclosure', () => {
    expect(render(el(Callout, { title: 'Hi' }))).not.toContain('<details')
  })
})

describe('Badge, EmptyState, Skeleton', () => {
  test('badge tones and count shape are classes', () => {
    expect(render(el(Badge, { tone: 'new', children: 'New' }))).toBe(
      '<span class="ui-badge ui-badge--new">New</span>',
    )
    expect(render(el(Badge, { count: true, children: 3 }))).toContain('ui-badge--count')
  })

  test('empty state heading level follows the prop', () => {
    const html = render(el(EmptyState, { title: 'No offers', headingLevel: 3, children: 'Body' }))
    expect(html).toContain('<h3 class="ui-empty__title">No offers</h3>')
    expect(render(el(EmptyState, { title: 'No offers' }))).toContain('<h2')
  })

  test('skeletons are hidden from assistive tech', () => {
    expect(render(el(Skeleton, { shape: 'circle', width: 44 }))).toContain('aria-hidden="true"')
    expect(render(el(SkeletonCard, {}))).toMatch(/^<div class="ui-skeleton-card" aria-hidden="true">/)
  })
})
