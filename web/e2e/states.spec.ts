import { expect, test } from '@playwright/test'
import { mockSupabase, NEW_IDS, offer, OFFERS, signIn } from './supabase-mock'

// The list's states (plan §4.10) and the New view's edges (§4.5), on a fixed clock (§6):
// 10:00 in Warsaw, so the next fetch is "today around 18:00" and every age is the same each run.
const FIXED_NOW = Date.parse('2026-10-08T10:00:00+02:00')

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW)
  await signIn(page)
})

test('an offer from the last fetch is in the New view even when it was published 30 h ago', async ({ page }) => {
  const late = offer('late', 'QA Lead', 'Late Corp', 70, 30)
  await mockSupabase(page, { now: FIXED_NOW, offers: [...OFFERS, late], newIds: [...NEW_IDS, late.external_id] })
  await page.goto('./')

  await expect(page.locator('.offer-title')).toHaveText(['Senior QA Engineer', 'QA Lead', 'QA Analyst'])
  await expect(page.getByText('3 new · fetched 2 h ago')).toBeVisible()
  await expect(page.getByText('Reviewed 0 of 3')).toBeVisible()
  await expect(page).toHaveTitle('(3) JOffers')
})

test('an offer from the last fetch with no publication date is in the New view', async ({ page }) => {
  const undated = OFFERS.find((o) => o.hoursAgo === null)!
  await mockSupabase(page, { now: FIXED_NOW, newIds: [undated.external_id] })
  await page.goto('./')

  await expect(page.locator('.offer-title')).toHaveText(['QA Automation Engineer'])
  await expect(page.locator('.offer')).toContainText('New')
})

test('an empty New view names the next fetch, and Show last 3 days widens it', async ({ page }) => {
  await mockSupabase(page, { now: FIXED_NOW, newIds: [] })
  await page.goto('./')

  await expect(page.getByRole('heading', { name: 'No new offers from the last fetch' })).toBeVisible()
  await expect(page.getByText('Next fetch today around 18:00')).toBeVisible()
  await expect(page).toHaveTitle('JOffers')
  await page.getByRole('button', { name: 'Show last 3 days' }).click()

  await expect(page.getByRole('radio', { name: '3 days' })).toBeChecked()
  await expect(page.locator('.offer-title')).toHaveText(['Senior QA Engineer', 'QA Analyst'])
})

test('a failed load says so in words, and Try again loads the list', async ({ page }) => {
  await mockSupabase(page, { now: FIXED_NOW, failJobs: 1 })
  await page.goto('./')

  await expect(page.getByRole('alert')).toHaveText("Couldn't load offers. Check your connection.")
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('statement timeout')
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.offer')).toHaveCount(2)
})

test('phone density: the first card within 200 px, and at least 4 whole cards', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'criterion 2 is a phone budget (Pixel 7)')
  // Eight new offers as the boards write them: some long titles, some salaries.
  const eight = [
    offer('n1', 'Senior QA Automation Engineer (Playwright, TypeScript)', 'Northwind Health', 88, 2, {
      salary_min: 22000, salary_max: 28000, salary_currency: 'PLN', salary_period: 'month',
    }),
    offer('n2', 'QA Engineer', 'Contoso', 81, 3, { salary_min: 140, salary_max: 160, salary_currency: 'PLN', salary_period: 'hour' }),
    offer('n3', 'Test Automation Engineer – API & SQL', 'Fabrikam Finance', 77, 4),
    offer('n4', 'Quality Assurance Specialist', 'Tailspin', 72, 5, {
      salary_min: 5000, salary_max: 6000, salary_currency: 'EUR', salary_period: 'month',
    }),
    offer('n5', 'QA Analyst', 'Litware', 66, 6),
    offer('n6', 'Manual and Automation Tester for a Healthcare SaaS Platform', 'Adventure Works', 61, 7),
    offer('n7', 'QA Engineer (B2B)', 'Wingtip', 55, 9),
    offer('n8', 'Software Tester', 'Proseware', 48, 12),
  ]
  await mockSupabase(page, { now: FIXED_NOW, offers: eight, newIds: eight.map((o) => o.external_id) })
  await page.goto('./')

  await expect(page.getByText('8 new · fetched 2 h ago')).toBeVisible()
  await expect(page.locator('.offer')).toHaveCount(8)
  const height = page.viewportSize()!.height
  const boxes = await page.locator('.offer').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().toJSON()))
  expect(boxes[0].top, 'first card top').toBeLessThanOrEqual(200)
  expect(boxes.filter((box) => box.top >= 0 && box.bottom <= height).length, 'whole cards on screen').toBeGreaterThanOrEqual(4)
})

test('with nothing new and a failed board, the chip and Refresh are still there', async ({ page }) => {
  await mockSupabase(page, { now: FIXED_NOW, newIds: [] })
  await page.goto('./')

  await expect(page.getByText('0 new · fetched 2 h ago')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pracuj.pl failed' })).toBeVisible()
  const refresh = page.getByRole('button', { name: 'Refresh offers' })
  await expect(refresh).toBeVisible()
  // The progress line goes with the New set.
  await expect(page.getByText(/^Reviewed \d/)).toHaveCount(0)

  // A refresh reloads in place: no skeleton, the empty state stays up.
  const reloaded = page.waitForRequest((request) => request.url().includes('/rest/v1/jobs?'))
  await refresh.click()
  await reloaded
  await expect(page.getByText('Next fetch today around 18:00')).toBeVisible()
  await expect(page.locator('.list-skeleton')).toHaveCount(0)
})

test('?view=new opens the New view and leaves the URL', async ({ page, baseURL }) => {
  await page.addInitScript(() =>
    localStorage.setItem('joffers-filters', JSON.stringify({ v: 2, window: 'any', minScore: 0, status: 'ALL', source: 'ALL', query: '', sort: 'score' })),
  )
  await mockSupabase(page, { now: FIXED_NOW })
  await page.goto('./?view=new')

  await expect(page.getByRole('radio', { name: 'New', exact: true })).toBeChecked()
  await expect(page.locator('.offer-title')).toHaveText(['Senior QA Engineer', 'QA Analyst'])
  await expect(page).toHaveURL(new URL('./', baseURL).href)
})

test('an offer opened while saving fails counts as reviewed here, and is saved on the next load', async ({ page }) => {
  const supabase = await mockSupabase(page, { now: FIXED_NOW })
  // Registered last, so it answers before the mock: the Reviewed write fails.
  const RPC = '**/rest/v1/rpc/save_offer_tracking'
  await page.route(RPC, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"offline"}' }))
  await page.goto('./')

  const acme = page.locator('.offer', { hasText: 'Senior QA Engineer' })
  await expect(acme).toHaveClass(/offer--unread/)
  await expect(page).toHaveTitle('(2) JOffers')
  await acme.click()
  await expect(page.getByRole('complementary', { name: 'Offer details' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Not saved, so still To review (the New badge, no pill), but no longer unread on this device.
  await expect(acme).not.toHaveClass(/offer--unread/)
  await expect(acme).toContainText('New')
  await expect(page.getByText('Reviewed 1 of 2')).toBeVisible()
  await expect(page).toHaveTitle('(1) JOffers')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('joffers-seen') ?? '[]'))).toEqual([OFFERS[1].external_id])

  await page.unroute(RPC)
  await page.reload()
  await expect.poll(() => supabase.rpcCalls).toEqual([
    { p_external_id: OFFERS[1].external_id, p_status: 'REVIEW', p_rate: '', p_notice: '' },
  ])
  await expect(acme.locator('.ui-status-pill')).toHaveText('Reviewed')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('joffers-seen'))).toBe('[]')
})
