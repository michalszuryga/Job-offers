import { expect, test, type Page } from '@playwright/test'
import { openFilters } from './filters'
import { mockSupabase, signIn } from './supabase-mock'

// Plan §1 #1: nothing raw on screen — no enums, snake_case keys, nulls or raw errors.
const RAW = /TO_REVIEW|READY_TO_APPLY|CV_GENERATED|_penalty|matched_|salary_assessment|\bnull\b|undefined|NaN/
// English UI words that must not survive in the Polish UI. Scraped text (titles, "Remote") stays as written.
const ENGLISH = /\b(?:ago|Last fetch|offers?|published|month|Loading|Score|Saved?|Total|Matched|failed|Role|Freshness)\b/

async function openDetails(page: Page, title: string) {
  await page.locator('.offer', { hasText: title }).click()
  return page.getByRole('complementary')
}

test('list and details show labels, never raw values', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await page.getByRole('radio', { name: 'Any time' }).check()
  await expect(page.locator('.offer')).toHaveCount(4)
  const details = await openDetails(page, 'Senior QA Engineer')
  await expect(details.getByText('Full description of Senior QA Engineer.')).toBeVisible()

  const breakdown = details.getByRole('list', { name: 'Score breakdown' })
  for (const label of ['Role', 'Technologies', 'Remote', 'Contract', 'Freshness']) {
    await expect(breakdown).toContainText(label)
  }
  await expect(breakdown).toContainText('+20 / 20')
  await expect(details.getByText('Total 75 / 100')).toBeVisible()

  // The collapsed description comes back as a heading and bullet lists, as text.
  await expect(details.getByRole('heading', { name: 'Wymagania' })).toBeVisible()
  await expect(details.getByRole('listitem').filter({ hasText: 'Playwright i TypeScript' })).toBeVisible()

  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(RAW)
})

test('an offer without a publication date says so in a whole sentence', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await page.getByRole('radio', { name: 'Any time' }).check()
  const details = await openDetails(page, 'QA Automation Engineer')
  await expect(details.getByText('Publication date unknown')).toBeVisible()
  await expect(details).not.toContainText('published date unknown')
  // Its own breakdown: the title penalty, and no salary bonus without a salary.
  await expect(details.getByRole('list', { name: 'Score breakdown' })).toContainText('"Automation" in title')
  await expect(details.getByText('Total 30 / 100')).toBeVisible()
})

test('the status filter offers grouped labels, keeping enum values', async ({ page }) => {
  await mockSupabase(page)
  await signIn(page)
  await page.goto('./')

  await openFilters(page)
  const status = page.getByLabel('Status')
  await expect(status.locator('optgroup')).toHaveCount(4)
  const groups = await status.locator('optgroup').evaluateAll((els) => els.map((el) => el.getAttribute('label')))
  expect(groups).toEqual(['Triage', 'Preparing', 'Active', 'Closed'])
  await status.selectOption({ label: 'Ready to apply' })
  await expect(status).toHaveValue('READY_TO_APPLY')
  await expect(page.locator('.offer')).toHaveCount(0)
})

test('a load error is friendly, keeps the raw text folded, and recovers', async ({ page }) => {
  await mockSupabase(page, { failJobs: 1 })
  await signIn(page)
  await page.goto('./')

  await expect(page.getByRole('alert')).toHaveText("Couldn't load offers. Check your connection.")
  const technical = page.locator('details', { hasText: 'Technical details' })
  await expect(technical).not.toHaveAttribute('open')
  // innerText leaves out the closed <details>, so the Supabase message is nowhere on screen.
  expect(await page.evaluate(() => document.body.innerText)).not.toContain('statement timeout')

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.locator('.offer').first()).toBeVisible()
})

test('says when the list stops at its row limit', async ({ page }) => {
  await mockSupabase(page, { total: 2400 })
  await signIn(page)
  await page.goto('./')

  await expect(page.getByText('Showing the first 4 offers')).toBeVisible()
})

test.describe('in Polish', () => {
  test.use({ locale: 'pl-PL' })

  test('follows the browser language, statuses included', async ({ page }) => {
    const supabase = await mockSupabase(page)
    await signIn(page)
    await page.goto('./')

    await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
    await expect(page.getByText('2 z 4 ofert')).toBeVisible()
    await expect(page.getByText('2 nowe · pobrano 2 godz. temu')).toBeVisible()
    await expect(page.locator('.offer').first()).toContainText('20 000–25 000 PLN/mies.')

    const details = await openDetails(page, 'Senior QA Engineer')
    await expect(details.getByRole('list', { name: 'Składowe wyniku' })).toContainText('Stanowisko')
    // The status saves as soon as it is picked (P7); Save is for the rate and notice.
    await details.getByLabel('Status').selectOption({ label: 'Wysłano' })
    await details.getByLabel('Zaproponowana stawka').fill('140 PLN/godz. B2B')
    await details.getByRole('button', { name: 'Zapisz' }).click()
    await expect(details.getByRole('status')).toHaveText('Zapisano.')
    // Opening it marked it Reviewed first (P6).
    expect(supabase.rpcCalls).toMatchObject([
      { p_status: 'REVIEW' }, { p_status: 'APPLIED' }, { p_status: 'APPLIED', p_rate: '140 PLN/godz. B2B' },
    ])

    const back = details.getByRole('button', { name: 'Wróć do listy' })
    if (await back.isVisible()) await back.click()
    await expect(page.locator('.offer', { hasText: 'Senior QA Engineer' }).locator('.ui-status-pill')).toHaveText('Wysłano')
    const text = await page.evaluate(() => document.body.innerText)
    expect(text).not.toMatch(RAW)
    expect(text).not.toMatch(ENGLISH)
  })
})
