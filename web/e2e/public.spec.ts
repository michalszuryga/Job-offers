import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, OWNER, signIn, gotoLanding } from './supabase-mock'

// Signed-out paths (plan §4.2): the private-beta reply, code sign-in, an expired magic link
// (P5), and the public surface (P8): the demo, the access gate's way into it, language and
// theme. The contact address is playwright.config.ts's stand-in.
const CONTACT = 'privacy@example.test'

test('an address without an account hears about the private beta, never the raw reply', async ({ page }) => {
  const supabase = await mockSupabase(page, { otp: 'signupsDisabled' })
  await gotoLanding(page, './')

  await page.getByLabel('Email').fill('stranger@example.com')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()

  const status = page.getByRole('status')
  await expect(status).toContainText('JOffers is in private beta.')
  const request = status.getByRole('link', { name: 'Request access' })
  const href = new URL((await request.getAttribute('href'))!)
  expect(href.protocol + href.pathname).toBe(`mailto:${CONTACT}`)
  expect(href.searchParams.get('subject')).toBe('JOffers access request')
  expect(href.searchParams.get('body')).toContain('stranger@example.com')

  // Sign-up stays closed: the request says so, and the raw reply stays folded away.
  expect(supabase.otpRequests[0]).toMatchObject({ email: 'stranger@example.com', create_user: false })
  await expect(status.locator('details', { hasText: 'Technical details' })).not.toHaveAttribute('open')
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('Signups not allowed')
})

test('the code from the email signs in, for the installed app', async ({ page }) => {
  const supabase = await mockSupabase(page)
  await gotoLanding(page, './')

  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText(`sent a sign-in link to ${OWNER.email}`)
  // The implicit flow lands the link on the app's base (origin + BASE_URL), wherever it opens.
  expect(supabase.otpRequests[0]).toMatchObject({ email: OWNER.email, redirect_to: new URL('./', page.url()).href })

  await page.getByRole('button', { name: 'Have a code? Enter it' }).click()
  const code = page.getByLabel('6-digit code')
  await expect(code).toBeFocused()
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code')
  await expect(code).toHaveAttribute('inputmode', 'numeric')
  await code.fill('123 456')
  await expect(code).toHaveValue('123456')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await expect(page.locator('.offer').first()).toBeVisible()
  expect(supabase.verifyRequests).toEqual([expect.objectContaining({ email: OWNER.email, token: '123456', type: 'email' })])
})

test('a code can be entered before sending a link, e.g. after the installed app reloaded', async ({ page }) => {
  const supabase = await mockSupabase(page)
  await gotoLanding(page, './')

  await page.getByRole('button', { name: 'Have a code? Enter it' }).click()
  const code = page.getByLabel('6-digit code')
  await expect(code).toBeFocused()
  await code.fill('654321')
  // The code needs its address: an empty field says so and nothing is sent.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Email')).toBeFocused()
  expect(supabase.verifyRequests).toEqual([])

  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('.offer').first()).toBeVisible()
  expect(supabase.verifyRequests).toEqual([expect.objectContaining({ email: OWNER.email, token: '654321', type: 'email' })])
  // No new link went out, so the code the user is holding stayed valid.
  expect(supabase.otpRequests).toEqual([])
})

test('an expired magic link says so, focuses the email field and leaves a clean URL', async ({ page }) => {
  await mockSupabase(page)
  await gotoLanding(page, './#error_code=otp_expired&error=access_denied&error_description=Email+link+is+invalid+or+has+expired')

  // On the landing, which stays signed out (no app, no supabase-js until the card is used).
  await expect(page.getByRole('heading', { level: 1, name: 'QA jobs, scored for you.' })).toBeVisible()
  await expect(page.getByText('This sign-in link has expired or was already used. Send a new one.')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page).toHaveURL(new URL('./', page.url()).href)
  expect(new URL(page.url()).hash).toBe('')

  // Sending a new link retires the notice.
  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText(`sent a sign-in link to ${OWNER.email}`)
  await expect(page.getByText('This sign-in link has expired')).toHaveCount(0)
})

test('after sending, the link can be resent after a minute or sent to another address', async ({ page }) => {
  await page.clock.install()
  const supabase = await mockSupabase(page)
  await gotoLanding(page, './')

  await page.getByLabel('Email').fill('owner@gmail.com')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText('sent a sign-in link to owner@gmail.com')
  await expect(page.getByRole('status')).toContainText('Works on any device. Check spam.')
  await expect(page.getByRole('link', { name: 'Open Gmail' })).toHaveAttribute('href', 'https://mail.google.com/')

  // aria-disabled rather than disabled, so it keeps focus through the countdown.
  const resend = page.getByRole('button', { name: /^Resend/ })
  // The installed clock still runs in real time, so a slow runner may already be at 59.
  await expect(resend).toHaveText(/^Resend in \d+ s$/)
  await expect(resend).toBeDisabled()

  await page.clock.runFor(60_000)
  await expect(resend).toHaveText('Resend link')
  await resend.click()
  await expect(page.getByRole('status')).toContainText('We sent a new sign-in link to owner@gmail.com.')
  expect(supabase.otpRequests).toHaveLength(2)

  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByLabel('Email')).toHaveValue('')
})

test('a resend that answers after "Use a different email" leaves the new form alone', async ({ page }) => {
  await page.clock.install()
  await mockSupabase(page)
  await gotoLanding(page, './')
  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByRole('status')).toContainText(`sent a sign-in link to ${OWNER.email}`)
  await page.clock.runFor(60_000)

  // Registered last, so it holds the resend before the mock answers it.
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = () => resolve()
  })
  await page.route('http://supabase.test/auth/v1/otp**', async (route) => {
    await held
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Resend link' }).click()
  await page.getByRole('button', { name: 'Use a different email' }).click()
  await page.getByLabel('Email').fill('other@example.com')

  const answered = page.waitForResponse('http://supabase.test/auth/v1/otp**')
  release()
  await answered
  // Real time for the late reply to reach React (the installed clock only fakes timers).
  await page.waitForTimeout(300)
  await expect(page.getByLabel('Email')).toHaveValue('other@example.com')
  await expect(page.getByLabel('Email')).toBeFocused()
  await expect(page.getByRole('status')).toBeEmpty()
})

test('Retry after a failed access check keeps focus, and gets in once the check passes', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  // Registered last, so it answers before the mock's app_members route.
  const MEMBERS = 'http://supabase.test/rest/v1/app_members**'
  await page.route(MEMBERS, (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
  await page.goto('./')
  await expect(page.getByText("Couldn't check your access.")).toBeVisible()

  const retry = page.getByRole('status').getByRole('button', { name: 'Retry' })
  const answered = page.waitForResponse(MEMBERS)
  await retry.click()
  await answered
  // Failed again: the gate stayed up the whole time, so focus never left Retry.
  await expect(page.getByText("Couldn't check your access.")).toBeVisible()
  await expect(retry).toBeFocused()

  await page.unroute(MEMBERS)
  await retry.click()
  await expect(page.locator('.offer').first()).toBeVisible()
})

test('a session that can no longer be refreshed says it expired', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page, { expired: true })
  await page.goto('./')

  await expect(page.getByText('Your session expired. Sign in again.')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeFocused()
})

test('signing out from the account menu is not mistaken for an expired session', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'QA jobs, scored for you.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Beta members: sign in' })).toBeVisible()
  await expect(page.getByText('Your session expired')).toHaveCount(0)
})

test('the demo makes no request to Supabase, even while used', async ({ page }) => {
  await mockSupabase(page)
  const supabaseRequests: string[] = []
  page.on('request', (sent) => {
    if (sent.url().startsWith('http://supabase.test/')) supabaseRequests.push(sent.url())
  })
  await page.goto('./')
  await page.getByRole('link', { name: 'Try the live demo' }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByText('Demo with sample data')).toBeVisible()
  await expect(page.getByText('3 new · fetched 2 h ago')).toBeVisible()

  // No account to sign out of: a way to sign in instead.
  await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()

  // Open the best new offer, change its status, and Undo: all of it in memory.
  await page.locator('.offer').first().click()
  const details = page.getByRole('complementary', { name: 'Offer details' })
  await expect(details.getByRole('heading', { level: 2, name: 'Senior QA Engineer' })).toBeVisible()
  await expect(details.getByText('Total 92 / 100')).toBeAttached()
  await details.getByLabel('Status').selectOption('APPLIED')
  await expect(page.locator('.ui-toast')).toContainText('Status: Applied')
  await page.locator('.ui-toast').getByRole('button', { name: 'Undo' }).click()
  await expect(details.getByLabel('Status')).toHaveValue('REVIEW')
  expect(supabaseRequests).toEqual([])
})

test('an account without access can try the demo from the access gate', async ({ page }) => {
  await mockSupabase(page, { member: false })
  await signIn(page)
  await page.goto('./')
  await expect(page.getByText('Explore the demo with sample data.')).toBeVisible()
  await page.getByRole('link', { name: 'Try the demo' }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByText('Demo with sample data')).toBeVisible()
  await expect(page.locator('.offer').first()).toBeVisible()
})

test.describe('in Polish', () => {
  test.use({ locale: 'pl-PL' })

  test('the landing follows the browser language', async ({ page }) => {
    await mockSupabase(page)
    await page.goto('./')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByRole('heading', { level: 1, name: 'Oferty QA ocenione pod Ciebie.' })).toBeVisible()
    await expect(page.getByLabel('E-mail')).toBeVisible()
  })
})

test('Dark chosen on the landing survives a reload', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('./')
  await page.getByLabel('Theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Theme')).toHaveValue('dark')
})

// Opt-in (npm run test:screens): the signed-out and edge screens as PNGs in web/screens/, for
// the same human review as screens.spec. Nothing is asserted beyond the content having loaded.
const SCREENS = join(import.meta.dirname, '..', 'screens')

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, { tag: '@screens' }, () => {
    test.use({ colorScheme: scheme })

    const shooter = (page: Page, project: string) => (name: string, fullPage = false) =>
      page.screenshot({ path: join(SCREENS, `${project}-${scheme}-${name}.png`), animations: 'disabled', fullPage })

    test('sign-in: idle, expired link, sent with the code field, private beta', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo.project.name)
      await mockSupabase(page)
      await page.goto('./')
      await page.getByLabel('Email').waitFor()
      await shot('signin-idle')

      // A fresh document: a hash-only goto would not reload the app.
      await page.goto('about:blank')
      await page.goto('./#error_code=otp_expired&error=access_denied')
      await page.getByText('This sign-in link has expired').waitFor()
      await shot('signin-expired')

      await page.getByLabel('Email').fill('owner@gmail.com')
      await page.getByRole('button', { name: 'Send sign-in link' }).click()
      await page.getByRole('button', { name: 'Have a code? Enter it' }).click()
      await page.getByLabel('6-digit code').waitFor()
      await shot('signin-sent')

      await page.unrouteAll()
      await mockSupabase(page, { otp: 'signupsDisabled' })
      await page.goto('./')
      await page.getByLabel('Email').fill('stranger@example.com')
      await page.getByRole('button', { name: 'Send sign-in link' }).click()
      await page.getByText('JOffers is in private beta.').waitFor()
      await shot('signin-error')
    })

    test('access gate: no access, and a failed check', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo.project.name)
      await mockSupabase(page, { member: false })
      await signIn(page)
      await page.goto('./')
      await page.getByText("This account doesn't have access yet.").waitFor()
      await shot('gate-no-access')

      // Registered last, so it answers before the mock's app_members route.
      await page.route('http://supabase.test/rest/v1/app_members**', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
      await page.reload()
      await page.getByText("Couldn't check your access.").waitFor()
      await shot('gate-error')
    })

    test('account menu, privacy and not found', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo.project.name)
      await mockSupabase(page)
      await signIn(page)
      await page.goto('./')
      await page.locator('.offer').first().waitFor()
      await page.getByRole('button', { name: 'Account' }).click()
      await page.getByRole('menu').waitFor()
      await shot('account-menu')

      await page.goto('./privacy/')
      await page.getByRole('heading', { level: 1, name: 'Privacy policy' }).waitFor()
      await shot('privacy')
      await shot('privacy-full', true)

      await page.goto('./nope')
      await page.getByRole('heading', { level: 1, name: 'Page not found' }).waitFor()
      await shot('notfound')
    })

    test('landing and demo', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo.project.name)
      await mockSupabase(page)
      await page.goto('./')
      await page.getByLabel('Email').waitFor()
      await page.locator('.phone-mock__device').waitFor()
      await shot('landing')
      await shot('landing-full', true)

      await page.getByRole('link', { name: 'Try the live demo' }).click()
      await page.locator('.offer').first().waitFor()
      await shot('demo')
      await page.locator('.offer').first().click()
      await page.getByRole('complementary', { name: 'Offer details' }).getByText('Total 92 / 100').waitFor({ state: 'attached' })
      await shot('demo-details')
    })
  })
}
