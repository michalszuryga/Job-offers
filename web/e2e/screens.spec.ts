import { join } from 'node:path'
import { test, type Page, type TestInfo } from '@playwright/test'
import { mockSupabase, offer, OFFERS, signIn } from './supabase-mock'

// Opt-in (npm run test:screens): writes PNGs to web/screens/ for a human review
// after each phase. Nothing is asserted beyond the content having loaded.
const SCREENS = join(import.meta.dirname, '..', 'screens')

// Viewport only: what fits above the fold is what the density review needs (plan §1 #2).
const shooter = (page: Page, testInfo: TestInfo, scheme: string) => (name: string) =>
  page.screenshot({
    path: join(SCREENS, `${testInfo.project.name}-${scheme}-${name}.png`),
    animations: 'disabled',
  })

const details = (page: Page, name = 'Offer details') => page.getByRole('complementary', { name })

// A real-length description, collapsed onto one line as the boards serve it: long enough
// for the phone's 14-line clamp.
// Scored 60, which is what the mock's stand-in breakdown adds up to for it.
const LONG = offer('long', 'QA Engineer (Playwright, API)', 'Northwind Health', 60, 5, {
  salary_min: 140, salary_max: 170, salary_currency: 'PLN', salary_period: 'hour',
  description: 'Northwind Health is looking for a QA Engineer to join a remote team building a healthcare SaaS '
    + 'platform used by 300 clinics. You will own the test strategy for the patient portal and its public API.'
    + 'Zakres obowiązków • Designing and maintaining end-to-end tests in Playwright and TypeScript • Testing REST '
    + 'APIs with Postman and contract tests • Writing SQL queries to verify data in PostgreSQL • Reviewing pull '
    + 'requests and pairing with developers on testability • Improving CI/CD pipelines in GitHub Actions Wymagania '
    + '• 3+ years of experience in software testing • Strong knowledge of Playwright or Cypress • Experience with '
    + 'API testing and SQL • Fluent English (B2+) Mile widziane • Experience in healthcare or fintech • Familiarity '
    + 'with AI-assisted testing tools Oferujemy • 100% remote work • B2B contract • Private medical care • Budget '
    + 'for conferences and training • Flexible hours',
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, { tag: '@screens' }, () => {
    test.use({ colorScheme: scheme })

    test('offer list and details', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo, scheme)
      await mockSupabase(page)
      await signIn(page)
      await page.goto('./')
      await page.locator('.offer').first().waitFor()
      await shot('list')

      // Desktop: the shortcuts dialog (P9) over the list.
      if (testInfo.project.name === 'desktop') {
        await page.keyboard.press('?')
        await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
        await shot('shortcuts')
        await page.keyboard.press('Escape')
      }

      await page.locator('.offer', { hasText: 'Senior QA Engineer' }).click()
      await page.getByText('Full description of Senior QA Engineer').waitFor()
      await shot('details')

      // "Why 75?" with the zero rows unfolded.
      await details(page).getByText(/categories with no points/).click()
      await details(page).getByRole('heading', { name: 'Why 75?' }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('details-breakdown')

      // A status change: the toast (over the phone's action bar), and the form it unfolds.
      await details(page).getByLabel('Status').selectOption('APPLIED')
      await details(page).getByLabel('Rate you quoted').fill('140 PLN/h B2B')
      await details(page).getByRole('button', { name: 'Save' }).focus()
      await shot('details-toast')
    })

    test('a long description', async ({ page }, testInfo) => {
      const shot = shooter(page, testInfo, scheme)
      await mockSupabase(page, { offers: [LONG, ...OFFERS], newIds: [LONG.external_id] })
      await signIn(page)
      await page.goto(`./?offer=${encodeURIComponent(LONG.external_id)}`)
      const heading = details(page).getByRole('heading', { name: 'Description' })
      await heading.waitFor()
      await details(page).getByText('Northwind Health is looking').waitFor()
      await heading.evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('details-description')
    })
  })
}

test.describe('in Polish', { tag: '@screens' }, () => {
  test.use({ locale: 'pl-PL' })

  test('offer details', async ({ page }, testInfo) => {
    const shot = shooter(page, testInfo, 'light')
    await mockSupabase(page, { offers: [LONG, ...OFFERS], newIds: [LONG.external_id] })
    await signIn(page)
    await page.goto(`./?offer=${encodeURIComponent(LONG.external_id)}`)
    const view = details(page, 'Szczegóły oferty')
    await view.getByText('Northwind Health is looking').waitFor()
    await shot('details-pl')
    await view.getByRole('heading', { name: /^Dlaczego/ }).evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await shot('details-pl-breakdown')
  })
})
