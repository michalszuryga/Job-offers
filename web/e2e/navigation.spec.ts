import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, OFFERS, signIn } from './supabase-mock'

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

test('on a phone, the back button on a cold deep link goes to the list, not off the site', async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the back button shows on phones only (P7 adds Close on desktop)')
  await page.goto(`./?offer=${encodeURIComponent(ACME.external_id)}`)
  await details(page).getByRole('button', { name: '← Back to list' }).click()
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
