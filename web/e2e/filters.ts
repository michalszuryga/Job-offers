import { expect, type Page } from '@playwright/test'

// Below 1024 px the filters (search, min score, status, source, sort) live in a sheet
// behind the toolbar's Filters button; from 1024 px they are inline in the toolbar, so these
// do nothing there (plan §4.6, §4.7). Opening an open sheet is a no-op too.
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 1024
export const filtersSheet = (page: Page) => page.getByRole('dialog', { name: 'Filters' })

export async function openFilters(page: Page) {
  if (!isPhone(page) || (await filtersSheet(page).isVisible())) return
  await page.getByRole('button', { name: /^Filters/ }).click()
  await expect(filtersSheet(page)).toBeVisible()
}

export async function closeFilters(page: Page) {
  if (!isPhone(page)) return
  await filtersSheet(page).getByRole('button', { name: /^Show \d+ offers?$/ }).click()
  await expect(filtersSheet(page)).toBeHidden()
}
