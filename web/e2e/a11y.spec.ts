import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { closeFilters, openFilters } from './filters'
import { mockSupabase, signIn } from './supabase-mock'

// WCAG 2.2 AA (plan §1 #5): the offer list (P6) and the offer details (P7) in light and dark,
// on desktop and phone, with sheets and toasts open; the landing, the demo and the privacy page
// (P8), signed out.

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

// Whether two boxes overlap at all (touching edges don't count).
async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const [boxA, boxB] = [await a.boundingBox(), await b.boundingBox()]
  if (!boxA || !boxB) return false
  return boxA.x < boxB.x + boxB.width && boxB.x < boxA.x + boxA.width
    && boxA.y < boxB.y + boxB.height && boxB.y < boxA.y + boxA.height
}

test.describe('signed in', () => {
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

      test('the offer details, unfolded, with a toast', async ({ page }, testInfo) => {
        test.slow()
        await mockSupabase(page)
        await page.goto('./')
        await page.locator('.offer', { hasText: 'Senior QA Engineer' }).click()
        const details = page.getByRole('complementary', { name: 'Offer details' })
        await expect(details.getByText('Full description of Senior QA Engineer.')).toBeVisible()
        await expectAccessible(page, 'details')

        // Everything open at once: the zero rows, the tracking form (Applied unfolds it), and
        // the status toast.
        await details.getByText(/categories with no points/).click()
        await details.getByLabel('Status').selectOption('APPLIED')
        const toast = page.locator('.ui-toast')
        await expect(toast).toBeVisible()
        await expectAccessible(page, 'details unfolded, with a toast')

        if (testInfo.project.name !== 'phone') return
        // Focus is never hidden behind the action bar or a toast (WCAG 2.4.11, §2.6). The worst
        // case: Save scrolled to just under the toast's top edge, the field before it in view.
        // A fresh toast first, so it is still up while the focus moves.
        await details.getByLabel('Status').selectOption('INTERVIEW')
        await details.getByLabel('Rate you quoted').fill('140 PLN/h B2B')
        await expect(toast).toBeVisible()
        const save = details.getByRole('button', { name: 'Save' })
        const toastTop = (await toast.boundingBox())!.y
        const saveTop = (await save.boundingBox())!.y
        await details.evaluate((element, by) => element.scrollBy({ top: by }), saveTop - (toastTop + 6))
        expect(await overlaps(save, toast), 'set-up: Save starts under the toast').toBe(true)
        await details.getByLabel('Notice period you gave').evaluate((field: HTMLElement) => field.focus({ preventScroll: true }))

        await page.keyboard.press('Tab')
        await expect(save).toBeFocused()
        await expect(toast).toBeVisible()
        expect(await overlaps(save, page.locator('.action-bar')), 'Save under the action bar').toBe(false)
        expect(await overlaps(save, toast), 'Save under the toast').toBe(false)
        // And on screen, below the sticky header.
        expect((await save.boundingBox())!.y).toBeGreaterThanOrEqual(56)
      })

      test('the empty New view', async ({ page }) => {
        await mockSupabase(page, { newIds: [] })
        await page.goto('./')
        await expect(page.getByRole('heading', { name: 'No new offers from the last fetch' })).toBeVisible()
        await expectAccessible(page, 'empty New view')
      })
    })
  }
})

test.describe('public pages', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(`${scheme} scheme`, () => {
      test.use({ colorScheme: scheme })

      test('the landing, with the sign-in card sent', async ({ page }) => {
        await mockSupabase(page)
        await page.goto('./')
        await page.locator('.phone-mock__device').waitFor()
        await page.locator('.how__grid').waitFor()
        await expectAccessible(page, 'landing')

        await page.getByLabel('Email').fill('owner@example.com')
        await page.getByRole('button', { name: 'Send sign-in link' }).click()
        await expect(page.getByRole('status')).toContainText('sent a sign-in link')
        await expectAccessible(page, 'landing, link sent')
      })

      test('the demo, list and details', async ({ page }) => {
        await mockSupabase(page)
        await page.goto('./demo')
        await expect(page.locator('.offer').first()).toBeVisible()
        await expectAccessible(page, 'demo list')
        await page.locator('.offer').first().click()
        const details = page.getByRole('complementary', { name: 'Offer details' })
        await expect(details.getByRole('heading', { level: 2 })).toBeVisible()
        await expect(details.getByText('Total 92 / 100')).toBeAttached()
        await expectAccessible(page, 'demo details')
      })

      test('the privacy page', async ({ page }) => {
        await mockSupabase(page)
        await page.goto('./privacy/')
        await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible()
        await expectAccessible(page, 'privacy')
      })
    })
  }
})
