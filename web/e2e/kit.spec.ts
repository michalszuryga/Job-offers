import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

// The UI kit page (plan P4, §6 `kit` project): axe and target sizes on every component in
// every state, plus the keyboard contracts of the overlays. It runs on the dev server
// only: the kit is not in the production build. `kit` has a mouse (32 px targets),
// `kit-phone` is a Pixel 7 with a touch screen (44 px).

const SCREENS = join(import.meta.dirname, '..', 'screens')

// Light and dark, each reached both ways: the OS preference (Auto), and a forced theme
// (html[data-theme], as the head script sets from a saved choice) against the opposite OS.
const SCHEMES = [
  { name: 'light', os: 'light', force: null, dark: false },
  { name: 'dark', os: 'dark', force: null, dark: true },
  { name: 'forced light', os: 'dark', force: 'Light', dark: false },
  { name: 'forced dark', os: 'light', force: 'Dark', dark: true },
] as const

// Everything a pointer can hit. A radio's target is its whole segment or chip (the label);
// both are measured as the union of the label and the stretched input.
const TARGETS = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role^="menuitem"]',
  'label:has(input[type="radio"])',
].join(', ')

async function openKit(page: Page) {
  await page.goto('./dev/kit')
  await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible()
}

const themeSwitch = (page: Page) => page.getByRole('group', { name: 'Theme' })
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Filters' })
const toast = (page: Page) => page.locator('.ui-toast')
const toastHeight = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--toast-h').trim())

// Waits for transitions in flight (a sheet sliding in, a toast fading) so axe and the
// screenshots see the settled state. Endless ones (shimmer, spinner) are skipped.
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

// Visible targets under `scope` smaller than `min` CSS px either way, described for the report.
async function undersized(page: Page, min: number, scope: string) {
  return page.evaluate(
    ([selector, scope, min]) => {
      const root = document.querySelector(scope)
      if (!root) throw new Error(`no ${scope}`)
      const name = (element: Element) =>
        (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
      return [...root.querySelectorAll(selector)]
        .filter((element) => element.checkVisibility({ visibilityProperty: true }))
        .flatMap((element) => {
          const label = element.closest('label')
          const radio = element.matches('label') ? element.querySelector('input[type="radio"]') : null
          const parts = [element, element.matches('input[type="radio"]') ? label : radio].filter((part) => part != null)
          const boxes = parts.map((part) => part.getBoundingClientRect())
          const width = Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left))
          const height = Math.max(...boxes.map((box) => box.bottom)) - Math.min(...boxes.map((box) => box.top))
          // Half a pixel of slack for subpixel layout.
          if (width + 0.5 >= min && height + 0.5 >= min) return []
          const classes = [...element.classList].map((name) => `.${name}`).join('')
          return [`${element.tagName.toLowerCase()}${classes} "${name(element)}" ${width.toFixed(1)}×${height.toFixed(1)}`]
        })
    },
    [TARGETS, scope, min] as const,
  )
}

async function expectTargets(page: Page, min: number, scope: string, state: string) {
  await settle(page)
  expect(await undersized(page, min, scope), `targets under ${min} px, ${state}`).toEqual([])
}

async function openSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open filters' }).click()
  await expect(sheet(page)).toBeVisible()
  return sheet(page)
}

async function openMenu(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Account' }).click()
  const menu = page.getByRole('menu', { name: 'Account' })
  await expect(menu).toBeVisible()
  return menu
}

for (const scheme of SCHEMES) {
  test.describe(scheme.name, () => {
    test.use({ colorScheme: scheme.os })

    test('axe finds nothing serious, at rest and with every overlay open', async ({ page }) => {
      // Five full-page axe runs: ~15 s here, so a slower CI runner gets the triple timeout.
      test.slow()
      await openKit(page)
      if (scheme.force) {
        await themeSwitch(page).getByRole('radio', { name: scheme.force }).check()
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme.force.toLowerCase())
      }
      // The palette really switched: the canvas is dark or light.
      const canvasDark = await page.evaluate(() => {
        const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number)
        return r + g + b < 3 * 128
      })
      expect(canvasDark).toBe(scheme.dark)

      await expectAccessible(page, 'at rest')

      // Raw error text under every "Technical details".
      for (const summary of await page.locator('summary').all()) await summary.click()
      await expectAccessible(page, 'technical details open')

      await openSheet(page)
      await expectAccessible(page, 'sheet open')
      await page.keyboard.press('Escape')
      await expect(sheet(page)).toBeHidden()

      await openMenu(page)
      await expectAccessible(page, 'menu open')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Mark as applied' }).click()
      await expect(toast(page)).toBeVisible()
      await expectAccessible(page, 'toast shown')
    })
  })
}

test('every visible target meets the minimum for the pointer', async ({ page }, testInfo) => {
  await openKit(page)
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
  expect(coarse, 'only kit-phone has a touch screen').toBe(testInfo.project.name === 'kit-phone')
  const min = coarse ? 44 : 32

  for (const summary of await page.locator('summary').all()) await summary.click()
  await expectTargets(page, min, 'body', 'page')

  await openSheet(page)
  await expectTargets(page, min, 'dialog[open]', 'sheet')
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toBeHidden()

  await openMenu(page)
  await expectTargets(page, min, '.ui-menu__panel', 'menu')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Simulate a failed save' }).click()
  await expect(toast(page)).toBeVisible()
  await expectTargets(page, min, '.ui-toast', 'toast')
})

test('sheet: focus moves in, Esc closes it and focus returns to the trigger', async ({ page }) => {
  await openKit(page)
  const entries = await page.evaluate(() => history.length)
  const trigger = page.getByRole('button', { name: 'Open filters' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(sheet(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('dialog[open]') != null)).toBe(true)
  // Page scroll is locked behind it (base.css html:has(dialog[open])).
  await expect(page.locator('html')).toHaveCSS('overflow-y', 'hidden')

  await page.keyboard.press('Escape')
  await expect(sheet(page)).toBeHidden()
  await expect(trigger).toBeFocused()

  // The close button and a footer action close it the same way.
  await openSheet(page)
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await expect(sheet(page)).toBeHidden()
  await expect(trigger).toBeFocused()
  await openSheet(page)
  await sheet(page).getByRole('button', { name: 'Show 12 offers' }).click()
  await expect(sheet(page)).toBeHidden()
  // Never touches history (§3).
  expect(new URL(page.url()).pathname).toMatch(/\/dev\/kit\/?$/)
  expect(await page.evaluate(() => history.length)).toBe(entries)
})

test('a toast waits while the sheet is open and shows once it closes', async ({ page }) => {
  await openKit(page)
  await openSheet(page)
  await sheet(page).getByRole('button', { name: 'Queue a toast' }).click()
  // Long enough for it to have appeared, were it not held back.
  await page.waitForTimeout(400)
  await expect(toast(page)).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(toast(page)).toContainText('Status: Applied')
})

test('menu: arrows move, Esc closes it and focus returns to the trigger', async ({ page }) => {
  await openKit(page)
  const trigger = page.getByRole('button', { name: 'Account' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu', { name: 'Account' })
  await expect(menu).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('menuitemradio', { name: 'Auto' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'Light' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('menuitemradio', { name: 'Auto' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  // A radio item applies and closes: the theme menu drives the same switch as the bar.
  await openMenu(page)
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(menu).toBeHidden()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(themeSwitch(page).getByRole('radio', { name: 'Dark' })).toBeChecked()
  await expect(trigger).toBeFocused()

  // Tab leaves as it would from the trigger: on past it, with no tab stop left in the menu.
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(menu).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open filters' })).toBeFocused()
})

test('menu: on a short screen the panel scrolls, and keeps its scroll', async ({ page }) => {
  // A phone in landscape: the account menu fits on neither side of the trigger.
  await page.setViewportSize({ width: 800, height: 360 })
  await openKit(page)
  const menu = await openMenu(page)
  const panel = page.locator('.ui-menu__panel')
  const scrollTop = () => panel.evaluate((element) => element.scrollTop)
  // Long enough for the menu to follow a scroll (it re-places on the next frame).
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  const insidePanel = (item: Locator) =>
    item.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const frame = element.closest('.ui-menu__panel')!.getBoundingClientRect()
      return box.top >= frame.top - 0.5 && box.bottom <= frame.bottom + 0.5
    })
  expect(await panel.evaluate((element) => element.scrollHeight > element.clientHeight), 'the panel overflows').toBe(true)

  // Focus moving past the fold scrolls its item into view, and it stays there.
  await page.keyboard.press('End')
  const last = menu.getByRole('menuitem', { name: 'Sign out' })
  await expect(last).toBeFocused()
  await frames()
  expect(await insidePanel(last), 'the focused item is in view').toBe(true)
  // The page scrolling under it moves the panel with the trigger, not the panel's own scroll.
  await page.evaluate(() => window.scrollBy(0, 8))
  await frames()
  expect(await scrollTop()).toBeGreaterThan(0)

  // A wheel over the panel scrolls it, and it is not snapped back to the top.
  await panel.evaluate((element) => {
    element.scrollTop = 0
  })
  await frames()
  const box = (await panel.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 120)
  await expect.poll(scrollTop).toBeGreaterThan(0)
  await frames()
  expect(await scrollTop()).toBeGreaterThan(0)
})

test.describe('menu without the Popover API', () => {
  // Firefox 120 (the floor) has no popover: the toggled-element fallback takes over.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const proto = HTMLElement.prototype as Partial<HTMLElement>
      delete proto.showPopover
      delete proto.hidePopover
      delete proto.togglePopover
      delete proto.popover
    })
  })

  test('opens, closes on Esc and on a press outside', async ({ page }) => {
    await openKit(page)
    const trigger = page.getByRole('button', { name: 'Account' })
    const menu = await openMenu(page)
    await expect(page.locator('.ui-menu__panel')).not.toHaveAttribute('popover')
    // Portalled, so no sticky ancestor's stacking context can put a later bar over it.
    await expect(page.locator('body > .ui-menu__panel')).toBeVisible()
    await expect(menu.getByRole('menuitemradio', { name: 'Auto' })).toBeFocused()
    // Moving between its items keeps it open, though they sit outside the trigger's DOM.
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitemradio', { name: 'Light' })).toBeFocused()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(trigger).toBeFocused()

    // A press on an item is inside the menu: the item applies, then the menu closes.
    await openMenu(page)
    await menu.getByRole('menuitemradio', { name: 'Dark' }).click()
    await expect(menu).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(trigger).toBeFocused()

    await openMenu(page)
    await page.getByRole('heading', { level: 1, name: 'UI kit' }).click()
    await expect(menu).toBeHidden()
  })
})

test('toast: Undo restores the status, Dismiss closes it, --toast-h resets', async ({ page }) => {
  await openKit(page)
  const pill = page.locator('.kit-toast-demo__current .ui-status-pill')
  await expect(pill).toHaveText('Interested')
  expect(await toastHeight(page)).toBe('0px')

  await page.getByRole('button', { name: 'Mark as applied' }).click()
  await expect(toast(page)).toContainText('Status: Applied')
  await expect(pill).toHaveText('Applied')
  // Announced once, through the polite live region.
  await expect(page.locator('.ui-toaster [aria-live="polite"]')).toHaveText('Status: Applied')
  await expect.poll(() => toastHeight(page)).not.toBe('0px')

  await toast(page).getByRole('button', { name: 'Undo' }).click()
  await expect(pill).toHaveText('Interested')
  await expect(toast(page)).toBeHidden()
  await expect.poll(() => toastHeight(page)).toBe('0px')

  await page.getByRole('button', { name: 'Simulate a failed save' }).click()
  await expect(toast(page)).toContainText("Couldn't save the status")
  await expect.poll(() => toastHeight(page)).not.toBe('0px')
  await toast(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(toast(page)).toBeHidden()
  await expect.poll(() => toastHeight(page)).toBe('0px')
})

test('Polish: component defaults follow the language, still accessible', async ({ page }) => {
  await openKit(page)
  await page.getByRole('group', { name: 'Language' }).getByRole('radio', { name: 'Polski' }).check()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl')
  await expect(page.locator('.ui-status-pill').first()).toHaveText('Do przejrzenia')
  await expectAccessible(page, 'Polish')

  // The sheet's title is the i18n "Filters".
  await page.getByRole('button', { name: 'Open filters' }).click()
  await expect(page.getByRole('dialog', { name: 'Filtry' }).getByRole('button', { name: 'Zamknij' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Simulate a failed save' }).click()
  await expect(toast(page).getByRole('button', { name: 'Ponów' })).toBeVisible()
  await expect(toast(page).getByRole('button', { name: 'Zamknij' })).toBeVisible()
})

// Opt-in (npm run test:screens): the whole kit, plus each overlay over it, for a human review.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} scheme`, { tag: '@screens' }, () => {
    test.use({ colorScheme: scheme })

    test('kit page', async ({ page }, testInfo) => {
      const device = testInfo.project.name === 'kit-phone' ? 'phone' : 'desktop'
      const shot = async (name: string, fullPage = false) => {
        await settle(page)
        await page.screenshot({ path: join(SCREENS, `kit-${device}-${scheme}${name}.png`), fullPage, animations: 'disabled' })
      }

      await openKit(page)
      await shot('', true)

      await openSheet(page)
      await shot('-sheet')
      await page.keyboard.press('Escape')
      await expect(sheet(page)).toBeHidden()

      // Trigger at the top, so the whole menu opens below it (lower down it flips and scrolls).
      await page.getByRole('button', { name: 'Account' }).evaluate((button) => button.scrollIntoView({ block: 'start' }))
      await openMenu(page)
      await shot('-menu')
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: 'Mark as applied' }).click()
      await expect(toast(page)).toBeVisible()
      await shot('-toast')
    })
  })
}
