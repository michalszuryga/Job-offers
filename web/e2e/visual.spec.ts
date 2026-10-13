import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, signIn } from './supabase-mock'

// Visual baselines (plan §1 #9, §6): list and details, light and dark, on each project
// (desktop and phone). Opt-in (npm run test:visual). Baselines come only from the Linux
// Playwright container (npm run test:visual:update, or the Tests workflow's visual job), so
// fonts and antialiasing match CI; the files carry the platform in their names.
const FIXED_NOW = Date.parse('2026-10-08T10:00:00+02:00')
const SNAPSHOT = { animations: 'disabled', maxDiffPixelRatio: 0.01 } as const

const details = (page: Page) => page.getByRole('complementary', { name: 'Offer details' })

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, { tag: '@visual' }, () => {
    test.use({ colorScheme: scheme })

    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(FIXED_NOW)
      await mockSupabase(page, { now: FIXED_NOW })
      await signIn(page)
    })

    test('offer list', async ({ page }) => {
      await page.goto('./')
      await page.locator('.offer').first().waitFor()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`list-${scheme}.png`, SNAPSHOT)
    })

    test('offer details', async ({ page }) => {
      await page.goto('./')
      await page.locator('.offer', { hasText: 'Senior QA Engineer' }).click()
      await details(page).getByText('Full description of Senior QA Engineer').waitFor()
      await page.evaluate(() => document.fonts.ready)
      await expect(page).toHaveScreenshot(`details-${scheme}.png`, SNAPSHOT)
    })
  })
}
