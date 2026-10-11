import { expect, test } from '@playwright/test'
import { closeFilters, openFilters } from './filters'
import { mockSupabase, OWNER, signIn } from './supabase-mock'

test('signed-out visitor can request a sign-in link', async ({ page }) => {
  const supabase = await mockSupabase(page)
  await page.goto('./')

  await page.getByLabel('Email').fill(OWNER.email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()

  await expect(page.getByRole('status')).toContainText(`sent a sign-in link to ${OWNER.email}`)
  expect(supabase.otpRequests[0]).toMatchObject({ email: OWNER.email })
})

test('signed-in account without membership gets no data', async ({ page }) => {
  await mockSupabase(page, { member: false })
  await signIn(page)
  await page.goto('./')

  await expect(page.getByText("This account doesn't have access yet.")).toBeVisible()
  await expect(page.locator('.offers')).toHaveCount(0)
})

test('defaults to the last 24 hours, best score first, with new offers marked', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  const titles = page.locator('.offer-title')
  await expect(titles).toHaveText(['Senior QA Engineer', 'QA Analyst'])
  await expect(page.locator('.offer').nth(0)).toContainText('New')
  await expect(page.locator('.offer').nth(1)).toContainText('New')
  await expect(page.locator('.offer').first()).toContainText('20 000–25 000 PLN/month')
  await expect(page.getByText('2 of 4 offers')).toBeVisible()
  await expect(page.getByText('2 new · fetched 2 h ago')).toBeVisible()
  await page.getByRole('button', { name: 'Pracuj.pl failed' }).click()
  await expect(page.getByRole('dialog', { name: 'Sources' })).toContainText('Blocked by the board (403)')
})

test('filters by time window, score, source and text, and remembers them', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await page.getByRole('radio', { name: 'Any time' }).check()
  await expect(page.locator('.offer')).toHaveCount(4)

  await openFilters(page)
  await page.getByRole('radio', { name: '65+' }).check()
  await expect(page.locator('.offer-title')).toHaveText(['Test Engineer', 'Senior QA Engineer'])

  await page.getByRole('radio', { name: 'Any score' }).check()
  await page.getByLabel('Source').selectOption('No Fluff Jobs')
  await expect(page.locator('.offer-title')).toHaveText(['QA Analyst'])

  await page.getByLabel('Source').selectOption('ALL')
  await page.getByLabel('Search title or company').fill('gamma')
  await expect(page.locator('.offer-title')).toHaveText(['Test Engineer'])
  await closeFilters(page)

  await page.reload()
  await openFilters(page)
  await expect(page.getByLabel('Search title or company')).toHaveValue('gamma')
  await expect(page.getByRole('radio', { name: 'Any time' })).toBeChecked()
})

test('saves application status, quoted rate and notice period', async ({ page }) => {
  const supabase = await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await page.getByRole('link', { name: /Senior QA Engineer/ }).click()
  const details = page.getByRole('complementary', { name: 'Offer details' })
  await expect(details.getByText('Full description of Senior QA Engineer.')).toBeVisible()
  await expect(details.getByRole('list', { name: 'Matched keywords' }).getByRole('listitem')).toHaveText(['playwright', 'typescript'])

  await details.getByLabel('Status').selectOption('APPLIED')
  await details.getByLabel('Rate you quoted').fill('140 PLN/h B2B')
  await details.getByLabel('Notice period you gave').fill('1 month')
  await details.getByRole('button', { name: 'Save' }).click()

  await expect(details.getByRole('status')).toHaveText('Saved.')
  expect(supabase.rpcCalls).toEqual([{
    p_external_id: 'https://board.test/acme',
    p_status: 'REVIEW',
    p_rate: '',
    p_notice: '',
  }, {
    p_external_id: 'https://board.test/acme',
    p_status: 'APPLIED',
    p_rate: '',
    p_notice: '',
  }, {
    p_external_id: 'https://board.test/acme',
    p_status: 'APPLIED',
    p_rate: '140 PLN/h B2B',
    p_notice: '1 month',
  }])

  // On a phone the details cover the list; go back to check the list updated.
  const back = details.getByRole('button', { name: 'Back to list' })
  if (await back.isVisible()) await back.click()
  await expect(page.getByRole('link', { name: /Senior QA Engineer/ })).toContainText('Applied')
})
