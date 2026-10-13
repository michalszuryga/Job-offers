import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, OFFERS, signIn } from './supabase-mock'

// Keyboard triage on desktop (plan §4.7, §5): j/k, Enter, Esc, o, i, /, and the ? dialog
// with its switch. The default New view lists Acme, then Beta (by score).
const ACME = OFFERS.find((o) => o.title === 'Senior QA Engineer')!
const BETA = OFFERS.find((o) => o.title === 'QA Analyst')!

const details = (page: Page) => page.getByRole('complementary', { name: 'Offer details' })
const title = (page: Page) => details(page).getByRole('heading', { level: 2 })
const offerUrl = (id: string) => new RegExp(`[?&]offer=${encodeURIComponent(id)}`)
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard triage is desktop only')
  await signIn(page)
})

async function openList(page: Page) {
  await page.goto('./')
  await expect(page.locator('.offer').first()).toBeVisible()
}

test('j and k walk the list, and back after j, j lands on the list', async ({ page }) => {
  await mockSupabase(page)
  await openList(page)

  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('Senior QA Engineer')
  await expect(page).toHaveURL(offerUrl(ACME.external_id))
  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('QA Analyst')
  await expect(page).toHaveURL(offerUrl(BETA.external_id))
  // The last offer: j stays put.
  await page.keyboard.press('j')
  await expect(page).toHaveURL(offerUrl(BETA.external_id))
  await page.keyboard.press('k')
  await expect(title(page)).toHaveText('Senior QA Engineer')
  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('QA Analyst')

  // One history entry for the whole walk.
  await page.goBack()
  await expect(details(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]offer=/)
  await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
})

test('Enter opens the focused card and Esc closes it', async ({ page }) => {
  await mockSupabase(page)
  await openList(page)

  await page.locator('.offer', { hasText: 'QA Analyst' }).focus()
  await page.keyboard.press('Enter')
  await expect(title(page)).toHaveText('QA Analyst')
  await page.keyboard.press('Escape')
  await expect(details(page)).toHaveCount(0)
  await expect(page).not.toHaveURL(/[?&]offer=/)
})

test('o opens the original offer in a new tab', async ({ page, context }) => {
  await mockSupabase(page)
  // The board itself is not part of the test.
  await context.route('https://board.test/**', (route) => route.fulfill({ body: 'offer' }))
  await openList(page)
  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('Senior QA Engineer')

  const popup = page.waitForEvent('popup')
  await page.keyboard.press('o')
  await expect(await popup).toHaveURL(ACME.url)
})

test('i marks the open offer Interested, with Undo', async ({ page }) => {
  const supabase = await mockSupabase(page)
  await openList(page)
  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('Senior QA Engineer')
  const status = details(page).getByLabel('Status')
  await expect(status).toHaveValue('REVIEW')

  await page.keyboard.press('i')
  await expect(status).toHaveValue('INTERESTED')
  await expect.poll(() => supabase.rpcCalls.at(-1)).toMatchObject({ p_external_id: ACME.external_id, p_status: 'INTERESTED' })

  await page.locator('.ui-toast').getByRole('button', { name: 'Undo' }).click()
  await expect(status).toHaveValue('REVIEW')
  await expect.poll(() => supabase.rpcCalls.at(-1)).toMatchObject({ p_external_id: ACME.external_id, p_status: 'REVIEW' })

  // From a later stage, i never moves an offer back.
  await status.selectOption('APPLIED')
  await title(page).focus()
  await page.keyboard.press('i')
  await expect(status).toHaveValue('APPLIED')
})

test('/ focuses the search, where keys are typed rather than run', async ({ page }) => {
  await mockSupabase(page)
  await openList(page)
  const search = page.getByRole('searchbox', { name: 'Search' })

  await page.keyboard.press('/')
  await expect(search).toBeFocused()
  await page.keyboard.type('jk?')
  await expect(search).toHaveValue('jk?')
  await expect(details(page)).toHaveCount(0)
  await expect(dialog(page)).toHaveCount(0)
})

test('? lists the shortcuts, and turning them off lasts across a reload', async ({ page }) => {
  await mockSupabase(page)
  await openList(page)

  await page.keyboard.press('?')
  await expect(dialog(page)).toBeVisible()
  for (const label of ['Next / previous offer', 'Open the original offer in a new tab', 'Mark as interested', 'Not for me', 'Search']) {
    await expect(dialog(page).getByText(label, { exact: true })).toBeVisible()
  }
  // Keys are ignored while the dialog is open.
  await page.keyboard.press('j')
  await expect(details(page)).toHaveCount(0)

  const toggle = dialog(page).getByRole('switch', { name: 'Use keyboard shortcuts' })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)

  await page.reload()
  await expect(page.locator('.offer').first()).toBeVisible()
  await expect(page.getByText('Keyboard shortcuts are off.')).toBeVisible()
  await page.keyboard.press('j')
  await page.keyboard.press('?')
  await expect(details(page)).toHaveCount(0)
  await expect(dialog(page)).toHaveCount(0)

  // Back on from the account menu.
  await page.getByRole('button', { name: 'Account' }).click()
  await page.getByRole('menuitem', { name: 'Keyboard shortcuts' }).click()
  await expect(dialog(page)).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await toggle.check()
  await dialog(page).getByRole('button', { name: 'Close' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await page.keyboard.press('j')
  await expect(title(page)).toHaveText('Senior QA Engineer')
})
