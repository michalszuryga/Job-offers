import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, OFFERS, signIn, type MockOffer } from './supabase-mock'

// Status changes from the details (plan §4.9): optimistic, through the one write queue, then
// a toast with Undo. A status saves the moment it is picked; Save is for the rate and notice.
const ACME = OFFERS.find((o) => o.title === 'Senior QA Engineer')!

const details = (page: Page) => page.getByRole('complementary', { name: 'Offer details' })
const card = (page: Page, title: string) => page.locator('.offer', { hasText: title })
const toast = (page: Page) => page.locator('.ui-toast')

// The database as it stands, with Acme changed.
const withAcme = (change: Partial<MockOffer>) => OFFERS.map((o) => (o === ACME ? { ...o, ...change } : o))

// The phone's Star (in the action bar). Desktop has none (§4.8): the header's Status select.
async function markInterested(page: Page, phone: boolean) {
  if (phone) await details(page).getByRole('button', { name: 'Mark as interested' }).click()
  else await details(page).getByLabel('Status').selectOption('INTERESTED')
}

async function openAcme(page: Page) {
  await page.goto('./')
  await card(page, 'Senior QA Engineer').click()
  await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Senior QA Engineer')
}

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test('Interested keeps the saved rate, and Undo puts Reviewed back', async ({ page }, testInfo) => {
  const phone = testInfo.project.name === 'phone'
  const supabase = await mockSupabase(page, { offers: withAcme({ application_status: 'REVIEW', applied_rate: '120 PLN/h B2B' }) })
  await openAcme(page)
  const status = details(page).getByLabel('Status')
  await expect(status).toHaveValue('REVIEW')

  await markInterested(page, phone)
  await expect(status).toHaveValue('INTERESTED')
  await expect(toast(page)).toContainText('Status: Interested')
  if (phone) {
    // Two taps at most and no Save (§1 #3); the Star goes, and focus lands on what it set.
    await expect(details(page).getByRole('button', { name: 'Mark as interested' })).toHaveCount(0)
    await expect(status).toBeFocused()
  }
  await expect.poll(() => supabase.rpcCalls).toEqual([
    { p_external_id: ACME.external_id, p_status: 'INTERESTED', p_rate: '120 PLN/h B2B', p_notice: '' },
  ])
  // Never moves on to another offer.
  await expect(details(page).getByRole('heading', { level: 2 })).toHaveText('Senior QA Engineer')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(status).toHaveValue('REVIEW')
  await expect(toast(page)).toContainText('Status: Reviewed')
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await expect.poll(() => supabase.rpcCalls.at(-1)).toEqual(
    { p_external_id: ACME.external_id, p_status: 'REVIEW', p_rate: '120 PLN/h B2B', p_notice: '' },
  )
  if (!phone) await expect(card(page, 'Senior QA Engineer').locator('.ui-status-pill')).toHaveText('Reviewed')
})

test('a status that fails to save rolls back, and Retry saves it', async ({ page }) => {
  let failing = true
  const supabase = await mockSupabase(page, { failRpc: (call) => failing && call.p_status === 'APPLIED' })
  await openAcme(page)
  // Opening it marked it Reviewed.
  await expect.poll(() => supabase.rpcCalls).toEqual([
    { p_external_id: ACME.external_id, p_status: 'REVIEW', p_rate: '', p_notice: '' },
  ])
  const status = details(page).getByLabel('Status')

  await status.selectOption('APPLIED')
  await expect(toast(page)).toContainText("Couldn't save the status")
  await expect(status).toHaveValue('REVIEW')
  expect(supabase.failedRpcCalls).toHaveLength(1)
  expect(supabase.rpcCalls).toHaveLength(1)

  failing = false
  await toast(page).getByRole('button', { name: 'Retry' }).click()
  await expect(status).toHaveValue('APPLIED')
  await expect(toast(page)).toContainText('Status: Applied')
  await expect.poll(() => supabase.rpcCalls.at(-1)).toEqual(
    { p_external_id: ACME.external_id, p_status: 'APPLIED', p_rate: '', p_notice: '' },
  )
})

test('Save, then a status change at once: the last write keeps the new rate', async ({ page }, testInfo) => {
  // Every write takes a while, so the status change queues behind the Save.
  const supabase = await mockSupabase(page, { rpcDelay: 400 })
  await openAcme(page)
  const view = details(page)

  // Collapsed while there is nothing to note and the offer isn't ready to apply.
  const toggle = view.getByRole('button', { name: 'Your application' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await view.getByLabel('Rate you quoted').fill('150 PLN/h B2B')
  await view.getByRole('button', { name: 'Save' }).click()
  await markInterested(page, testInfo.project.name === 'phone')

  await expect(view.getByRole('status')).toHaveText('Saved.')
  await expect.poll(() => supabase.rpcCalls).toEqual([
    { p_external_id: ACME.external_id, p_status: 'REVIEW', p_rate: '', p_notice: '' },
    { p_external_id: ACME.external_id, p_status: 'REVIEW', p_rate: '150 PLN/h B2B', p_notice: '' },
    { p_external_id: ACME.external_id, p_status: 'INTERESTED', p_rate: '150 PLN/h B2B', p_notice: '' },
  ])
  // The Save landing first didn't put the old status back.
  await expect(view.getByLabel('Status')).toHaveValue('INTERESTED')
  await expect(view.getByRole('button', { name: 'Save' })).toBeDisabled()
})

test('the tab title counts the new offers still to review', async ({ page }, testInfo) => {
  await mockSupabase(page)
  await page.goto('./')
  await expect(page).toHaveTitle('(2) JOffers')

  await card(page, 'Senior QA Engineer').click()
  // Opening it marked it Reviewed.
  await expect(page).toHaveTitle('(1) JOffers')
  const status = details(page).getByLabel('Status')
  await status.selectOption('TO_REVIEW')
  await expect(page).toHaveTitle('(2) JOffers')
  await markInterested(page, testInfo.project.name === 'phone')
  await expect(page).toHaveTitle('(1) JOffers')

  await page.keyboard.press('Escape')
  await expect(details(page)).toHaveCount(0)
  await expect(page).toHaveTitle('(1) JOffers')
  await expect(card(page, 'Senior QA Engineer').locator('.ui-status-pill')).toHaveText('Interested')
})
