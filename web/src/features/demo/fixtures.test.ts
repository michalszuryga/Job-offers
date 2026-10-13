import { describe, expect, test } from 'vitest'
import { breakdownRows, parseBreakdown, SCORE_DEFAULTS, scoreBand, staleAfterDays } from '../../lib/score'
import { sourceHealth } from '../../lib/sources'
import { createDemoSource } from './demoSource'
import { DEMO_NEW_IDS, demoDashboard, demoDetails, previewOffers } from './fixtures'

// The demo must show every state the real list can (plan §4.11), with made-up names only.
const NOW = Date.parse('2026-10-13T16:00:00Z')
const DAY = 86_400_000
const dashboard = demoDashboard(NOW)
const { offers } = dashboard
const details = offers.map((offer) => demoDetails(offer)!)

describe('demo fixtures', () => {
  test('12 offers covering every score band, 3 of them new', () => {
    expect(offers).toHaveLength(12)
    expect(new Set(offers.map((offer) => scoreBand(offer.score)))).toEqual(new Set(['top', 'strong', 'fair', 'low', 'none']))
    expect(DEMO_NEW_IDS.size).toBe(3)
    expect(offers.filter((offer) => dashboard.newIds.has(offer.external_id))).toHaveLength(3)
  })

  test('every breakdown adds up to its score, as "Why N?" shows it', () => {
    for (const [i, offer] of offers.entries()) {
      const breakdown = details[i].score_breakdown
      if (offer.score == null) {
        expect(breakdown, offer.title!).toBeNull()
        continue
      }
      expect(breakdownRows(parseBreakdown(breakdown), SCORE_DEFAULTS).total, offer.title!).toBe(offer.score)
    }
  })

  test('an hourly B2B salary, a stale offer, a title penalty and a null score', () => {
    expect(offers.some((offer) => offer.salary_period === 'hour' && offer.contract === 'B2B')).toBe(true)
    const penalties = details.map((detail) => parseBreakdown(detail.score_breakdown))
    const stale = offers.filter((_, i) => (penalties[i].stale_offer_penalty as number) < 0)
    expect(stale).toHaveLength(1)
    expect(NOW - Date.parse(stale[0].published_at!)).toBeGreaterThan(staleAfterDays(SCORE_DEFAULTS) * DAY)
    expect(penalties.some((breakdown) => (breakdown.title_automation_penalty as number) < 0)).toBe(true)
    expect(offers.filter((offer) => offer.score == null)).toHaveLength(1)
  })

  test('one source failed in the last run', () => {
    const health = sourceHealth(dashboard.lastRun)
    expect(health.state).toBe('failed')
    expect(health.failed.map((source) => source.name)).toEqual(['Hirewave'])
  })

  test('collapsed descriptions, and no real job board named anywhere', () => {
    for (const detail of details) expect(detail.description).not.toContain('\n')
    const text = JSON.stringify([dashboard.lastRun, details]).toLowerCase()
    for (const board of ['justjoin', 'no fluff', 'nofluff', 'pracuj', 'theprotocol', 'bulldog', 'rocketjobs', 'linkedin', 'indeed']) {
      expect(text, board).not.toContain(board)
    }
  })

  test('the landing preview: the three new offers and one marked, best first', () => {
    const preview = previewOffers(NOW)
    expect(preview).toHaveLength(4)
    expect(preview.map((offer) => offer.score)).toEqual([...preview.map((offer) => offer.score)].sort((a, b) => b! - a!))
  })
})

describe('demo source', () => {
  test('keeps saves in memory and dates the first Applied', async () => {
    const source = createDemoSource(() => NOW)
    const id = [...DEMO_NEW_IDS][0]
    await source.saveTracking(id, { status: 'APPLIED', rate: '120 PLN/h', notice: '1 month' })
    await source.saveTracking(id, { status: 'INTERVIEW', rate: '120 PLN/h', notice: '1 month' })
    const saved = (await source.loadDashboard()).offers.find((offer) => offer.external_id === id)!
    expect(saved).toMatchObject({ application_status: 'INTERVIEW', applied_rate: '120 PLN/h', notice_period: '1 month' })
    expect(saved.applied_at).toBe(new Date(NOW).toISOString())
    expect((await source.loadOfferDetails(id)).application_status).toBe('INTERVIEW')
    expect(source.persistent).toBe(false)
  })

  test('a fresh page load starts from the fixtures again', async () => {
    const id = [...DEMO_NEW_IDS][0]
    const offer = (await createDemoSource(() => NOW).loadDashboard()).offers.find((o) => o.external_id === id)!
    expect(offer.application_status).toBe('TO_REVIEW')
  })
})
