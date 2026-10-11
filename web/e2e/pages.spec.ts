import { expect, test } from '@playwright/test'
import { mockSupabase, OFFERS, signIn } from './supabase-mock'

// The built app as GitHub Pages serves it (scripts/static-server.mjs, the `pages` project):
// no SPA fallback, a 301 to the trailing slash for a directory, and 404.html with status 404
// for anything else. P5 scope; P8 adds ./demo and ./demo/.
const ACME = OFFERS.find((offer) => offer.title === 'Senior QA Engineer')!

test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('the base path answers 200 with the app', async ({ page }) => {
  const response = await page.goto('./')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('./privacy redirects to ./privacy/ and shows the policy without supabase-js', async ({ page, request }) => {
  const redirect = await request.get('./privacy', { maxRedirects: 0 })
  expect(redirect.status()).toBe(301)
  expect(new URL(redirect.headers().location, redirect.url()).href).toBe(new URL('./privacy/', redirect.url()).href)

  const supabaseRequests: string[] = []
  page.on('request', (sent) => {
    if (sent.url().startsWith('http://supabase.test/')) supabaseRequests.push(sent.url())
  })
  const response = await page.goto('./privacy')
  expect(response?.status()).toBe(200)
  expect(new URL(page.url()).pathname).toMatch(/\/privacy\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
  // Controller and contact come from the build (playwright.config.ts env).
  await expect(page.getByText('Test Controller')).toBeVisible()
  await expect(page.getByRole('link', { name: 'privacy@example.test' }).first()).toHaveAttribute(
    'href',
    'mailto:privacy@example.test',
  )
  // Signed out: nothing to sign out of, and no auth client was loaded to find that out.
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  expect(supabaseRequests).toEqual([])
})

test('signed in, Sign out on the privacy page signs out and returns to sign-in', async ({ page, baseURL }) => {
  await signIn(page)
  await page.goto('./privacy/')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname)
  expect(await page.evaluate(() => localStorage.getItem('joffers-auth'))).toBeNull()
})

test('an unknown path is a 404 that shows Page not found', async ({ page }) => {
  const response = await page.goto('./nope')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
})

test('a deep link to an offer opens its details', async ({ page }) => {
  await signIn(page)
  const response = await page.goto(`./?offer=${encodeURIComponent(ACME.external_id)}`)
  expect(response?.status()).toBe(200)

  const details = page.getByRole('complementary', { name: 'Offer details' })
  await expect(details.getByText('Full description of Senior QA Engineer.')).toBeVisible()
})

test('a route chunk that fails to load offers a reload, not a blank page', async ({ page }) => {
  // What Pages answers for a chunk the last deploy removed: its 404 page, as HTML.
  const CHUNK = '**/assets/AppRoot-*.js'
  await page.route(CHUNK, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html>' }))
  await page.goto('./')

  const status = page.getByRole('status')
  await expect(status).toContainText("Couldn't load JOffers. Check your connection.")
  await page.unroute(CHUNK)
  await status.getByRole('button', { name: 'Reload' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})
