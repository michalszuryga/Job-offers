import { join } from 'node:path'
import { test } from '@playwright/test'
import { mockSupabase, signIn } from './supabase-mock'

// Opt-in (npm run test:screens): writes PNGs to web/screens/ for a human review
// after each phase. Nothing is asserted beyond the content having loaded.
const SCREENS = join(import.meta.dirname, '..', 'screens')

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, { tag: '@screens' }, () => {
    test.use({ colorScheme: scheme })

    test('offer list and details', async ({ page }, testInfo) => {
      // Viewport only: what fits above the fold is what the density review needs (plan §1 #2).
      const shot = (name: string) => page.screenshot({
        path: join(SCREENS, `${testInfo.project.name}-${scheme}-${name}.png`),
        animations: 'disabled',
      })

      await mockSupabase(page)
      await signIn(page)
      await page.goto('./')
      await page.locator('.offer').first().waitFor()
      await shot('list')

      await page.locator('.offer', { hasText: 'Senior QA Engineer' }).click()
      await page.getByText('Full description of Senior QA Engineer').waitFor()
      await shot('details')
    })
  })
}
