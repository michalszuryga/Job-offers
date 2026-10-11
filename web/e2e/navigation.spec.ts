import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, offer, OFFERS, signIn } from './supabase-mock'

// ?offer= history rules (plan §4.1): opening from the list pushes, switching replaces,
// closing (back, Esc, the back button) returns to the list without leaving the app.
const ACME = OFFERS.find((offer) => offer.title === 'Senior QA Engineer')!

const details = (page: Page) => page.getByRole('complementary', { name: 'Offer details' })
const card = (page: Page, title: string) => page.locator('.offer', { hasText: title })

// Details closed, ?offer= gone, and still on the app's own page (not history before it).
async function expectList(page: Page, baseURL: string | undefined) {
  await expect(details(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]offer=/)
  await expect(card(page, 'QA Analyst')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname)
}

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
})

test('a deep link opens the details, and closing it stays in the app', async ({ page, baseURL }) => {
  await page.goto(`./?offer=${encodeURIComponent(ACME.external_id)}`)
  await expect(details(page).getByRole('heading', { name: 'Senior QA Engineer' })).toBeVisible()

  // Nothing of ours behind a cold deep link: closing drops ?offer= in place.
  await page.keyboard.press('Escape')
  await expectList(page, baseURL)
})

test('the back (phone) or close (desktop) button on a cold deep link goes to the list, not off the site', async ({ page, baseURL }, testInfo) => {
  await page.goto(`./?offer=${encodeURIComponent(ACME.external_id)}`)
  const name = testInfo.project.name === 'phone' ? 'Back to list' : 'Close details'
  await details(page).getByRole('button', { name }).click()
  await expectList(page, baseURL)
  expect(page.url()).toBe(new URL('./', baseURL).href)
})

test('back closes details opened from the list and lands on the list', async ({ page, baseURL }) => {
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  await expect(details(page).getByRole('heading', { name: 'Senior QA Engineer' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`[?&]offer=${encodeURIComponent(ACME.external_id)}`))

  await page.goBack()
  await expectList(page, baseURL)
})

test('Esc closes the details and the URL loses ?offer=', async ({ page, baseURL }) => {
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  await expect(details(page)).toBeVisible()
  await expect(page).toHaveURL(/[?&]offer=/)

  await page.keyboard.press('Escape')
  await expectList(page, baseURL)
  // Focus is back on the card that opened it (§4.8).
  await expect(card(page, 'Senior QA Engineer')).toBeFocused()
  // Closed with history.back(), so forward reopens the same offer.
  await page.goForward()
  await expect(details(page).getByRole('heading', { name: 'Senior QA Engineer' })).toBeVisible()
})

test('switching offers replaces the entry, so back still lands on the list', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'list and details side by side on desktop only')
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  await expect(details(page).getByRole('heading', { name: 'Senior QA Engineer' })).toBeVisible()
  await card(page, 'QA Analyst').click()
  await expect(details(page).getByRole('heading', { name: 'QA Analyst' })).toBeVisible()

  await page.goBack()
  await expectList(page, baseURL)
})

test('the logo closes open details the way back does', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'the app bar shows beside the details on desktop only')
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  await expect(details(page)).toBeVisible()

  await page.getByRole('banner').getByRole('link', { name: 'JOffers' }).click()
  await expectList(page, baseURL)
  // Went back to the list entry rather than pushing another one, so forward reopens it.
  await page.goForward()
  await expect(details(page).getByRole('heading', { name: 'Senior QA Engineer' })).toBeVisible()
})

// P7 (§4.8): the phone's full-screen view.
test('on a phone, Next replaces the entry, so back still lands on the list', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the full-screen details view is the phone\'s')
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  const view = details(page)
  await expect(view.getByRole('heading', { level: 2 })).toHaveText('Senior QA Engineer')
  // Focus starts on the title, and the list underneath is out of reach.
  await expect(view.getByRole('heading', { level: 2 })).toBeFocused()
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '')
  await expect(view).toContainText('1 / 2')

  await view.getByRole('button', { name: 'Next offer' }).click()
  await expect(view.getByRole('heading', { level: 2 })).toHaveText('QA Analyst')
  await expect(view).toContainText('2 / 2')
  await expect(view.getByRole('button', { name: 'Next offer' })).toHaveAttribute('aria-disabled', 'true')
  await expect(page).toHaveURL(/[?&]offer=https%3A%2F%2Fboard.test%2Fbeta/)

  await page.goBack()
  await expectList(page, baseURL)
  // Back on the card of the offer that was open when it closed.
  await expect(card(page, 'QA Analyst')).toBeFocused()
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '')
})

test('on a phone, Back to list returns focus to the card', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the full-screen details view is the phone\'s')
  await page.goto('./')
  await card(page, 'QA Analyst').click()
  await details(page).getByRole('button', { name: 'Back to list' }).click()
  await expectList(page, baseURL)
  await expect(card(page, 'QA Analyst')).toBeFocused()
})

test('on a phone, the list keeps its scroll position under the details', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the full-screen details view is the phone\'s')
  const many = Array.from({ length: 12 }, (_, n) => offer(`o${n}`, `QA Engineer ${n + 1}`, `Company ${n + 1}`, 90 - n, n + 1))
  // Registered after beforeEach's, so this one answers.
  await mockSupabase(page, { offers: many, newIds: many.map((o) => o.external_id) })
  await page.goto('./')

  const last = card(page, 'QA Engineer 12')
  await last.scrollIntoViewIfNeeded()
  const scrolled = await page.evaluate(() => window.scrollY)
  expect(scrolled).toBeGreaterThan(0)
  await last.click()
  await expect(details(page).getByRole('heading', { name: 'QA Engineer 12' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/details-open/)

  await page.keyboard.press('Escape')
  await expect(details(page)).toHaveCount(0)
  expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname)
  await expect(page.locator('html')).not.toHaveClass(/details-open/)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  await expect(last).toBeFocused()
})
