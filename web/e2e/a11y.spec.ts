import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { closeFilters, openFilters } from './filters'
import { mockSupabase, signIn } from './supabase-mock'

// WCAG 2.2 AA (plan §1 #5), P6 scope: the offer list in light and dark, on desktop and phone,
// with its sheets open. P7 adds the details, P8 the public pages.

// Waits for transitions in flight (a sheet sliding in) so axe sees the settled state.
// Endless ones (a spinner, the skeleton shimmer) are skipped.
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

async function expectAccessible(page: Page, state: string) {
  await settle(page)
  const { violations } = await new AxeBuilder({ page }).analyze()
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) =>
      [
        `${violation.id} (${violation.impact}): ${violation.help}`,
        ...violation.nodes.slice(0, 5).map((node) => `  ${node.target.join(' ')}\n    ${node.failureSummary?.replace(/\n/g, '\n    ')}`),
      ].join('\n'),
    )
  expect(serious, `axe, ${state}`).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme })

    test('the offer list, its filters and the sources sheet', async ({ page }, testInfo) => {
      test.slow()
      await mockSupabase(page)
      await page.goto('./')
      await expect(page.locator('.offer').first()).toBeVisible()
      await expectAccessible(page, 'list')

      // Filters on: the phone's chips row, the desktop's Clear all.
      await openFilters(page)
      if (testInfo.project.name === 'phone') await expectAccessible(page, 'filters sheet')
      await page.getByRole('radio', { name: '65+' }).check()
      await page.getByLabel('Search title or company').fill('qa')
      await closeFilters(page)
      await expect(page.getByRole('button', { name: 'Clear all' })).toBeVisible()
      await expectAccessible(page, 'filters on')

      await page.getByRole('button', { name: 'Pracuj.pl failed' }).click()
      const sources = page.getByRole('dialog', { name: 'Sources' })
      await expect(sources).toBeVisible()
      for (const summary of await sources.locator('summary').all()) await summary.click()
      await expectAccessible(page, 'sources sheet')
    })

    test('the empty New view', async ({ page }) => {
      await mockSupabase(page, { newIds: [] })
      await page.goto('./')
      await expect(page.getByRole('heading', { name: 'No new offers from the last fetch' })).toBeVisible()
      await expectAccessible(page, 'empty New view')
    })
  })
}
