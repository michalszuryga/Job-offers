import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Sun } from 'lucide-react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { I18nProvider, type Lang } from '../../i18n'
import { Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator, type MenuTriggerProps } from './Menu'
import { MENU_GAP, VIEWPORT_MARGIN, placeMenu } from './menuPlacement'
import { anyDialogOpen, setDialogOpen, subscribeDialogs } from './openDialogs'
import { Sheet } from './Sheet'
import { INITIAL_TOAST_STATE, TOAST_DURATION, timeLeft, toastReducer, useToast, type Toast, type ToastState } from './toast'
import { ToastProvider } from './Toaster'

// Overlay components of the kit: the pure rules behind them (toast clock, open-sheet
// registry, menu placement) and the ARIA wiring of their markup. Opening, focus and
// target sizes need a browser and are kit.spec's job.

// What <Type {...props} /> compiles to, typed; this file can't hold JSX (vitest runs *.test.ts).
const el = <P extends object>(type: (props: P) => ReactNode, props: P): ReactElement => jsx(type, props)

const render = (element: ReactElement, lang: Lang = 'en') =>
  renderToStaticMarkup(el(I18nProvider, { lang, children: element }))

// The opening tag of the first element matching `pattern`, so checks don't depend on attribute order.
const tag = (html: string, pattern: string) => html.match(new RegExp(`<[^>]*${pattern}[^>]*>`))?.[0] ?? ''
const dialogTag = (html: string) => html.match(/<dialog[^>]*>/)?.[0] ?? ''
const attr = (openingTag: string, name: string) => openingTag.match(new RegExp(` ${name}="([^"]*)"`))?.[1]

const toast = (id: number, duration = TOAST_DURATION): Toast => ({ id, message: `Toast ${id}`, duration })

// Runs actions in order; each action's `now` is its time in ms.
const run = (...actions: Parameters<typeof toastReducer>[1][]): ToastState =>
  actions.reduce(toastReducer, INITIAL_TOAST_STATE)

describe('toast clock', () => {
  test('a toast starts with its full time', () => {
    const state = run({ type: 'show', toast: toast(1), now: 100 })
    expect(state.toast?.id).toBe(1)
    expect(timeLeft(state, 100)).toBe(TOAST_DURATION)
    expect(timeLeft(state, 2100)).toBe(TOAST_DURATION - 2000)
    expect(timeLeft(state, 100 + TOAST_DURATION + 50)).toBe(0)
  })

  test('at most one: a new toast replaces the old one and restarts the clock', () => {
    const state = run({ type: 'show', toast: toast(1), now: 0 }, { type: 'show', toast: toast(2, 3000), now: 4000 })
    expect(state.toast?.id).toBe(2)
    expect(timeLeft(state, 4000)).toBe(3000)
  })

  test('a stale timer cannot dismiss the toast that replaced its own', () => {
    const shown = run({ type: 'show', toast: toast(1), now: 0 }, { type: 'show', toast: toast(2), now: 10 })
    expect(toastReducer(shown, { type: 'dismiss', id: 1 })).toBe(shown)
    expect(toastReducer(shown, { type: 'dismiss', id: 2 }).toast).toBeNull()
    expect(toastReducer(shown, { type: 'dismiss' }).toast).toBeNull()
  })

  test('hover or focus pauses it; the time already spent is kept', () => {
    const paused = run({ type: 'show', toast: toast(1), now: 0 }, { type: 'pause', paused: true, now: 1000 })
    expect(paused.since).toBeNull()
    expect(timeLeft(paused, 50_000)).toBe(TOAST_DURATION - 1000)

    const resumed = toastReducer(paused, { type: 'pause', paused: false, now: 9000 })
    expect(timeLeft(resumed, 9000)).toBe(TOAST_DURATION - 1000)
    expect(timeLeft(resumed, 10_000)).toBe(TOAST_DURATION - 2000)
  })

  test('a new toast is not paused by the old one', () => {
    const state = run(
      { type: 'show', toast: toast(1), now: 0 },
      { type: 'pause', paused: true, now: 500 },
      { type: 'show', toast: toast(2), now: 600 },
    )
    expect(state.paused).toBe(false)
    expect(state.since).toBe(600)
  })

  test('it waits while a sheet is open and shows afterwards with its full time', () => {
    const waiting = run({ type: 'block', blocked: true, now: 0 }, { type: 'show', toast: toast(1), now: 100 })
    expect(waiting.toast?.id).toBe(1)
    expect(waiting.since).toBeNull()
    expect(timeLeft(waiting, 60_000)).toBe(TOAST_DURATION)

    const shown = toastReducer(waiting, { type: 'block', blocked: false, now: 60_000 })
    expect(shown.since).toBe(60_000)
    expect(timeLeft(shown, 61_000)).toBe(TOAST_DURATION - 1000)
  })

  test('only the latest toast waits', () => {
    const state = run(
      { type: 'block', blocked: true, now: 0 },
      { type: 'show', toast: toast(1), now: 10 },
      { type: 'show', toast: toast(2), now: 20 },
      { type: 'block', blocked: false, now: 30 },
    )
    expect(state.toast?.id).toBe(2)
  })

  test('a toast covered by a sheet comes back with its full time', () => {
    const state = run(
      { type: 'show', toast: toast(1), now: 0 },
      { type: 'block', blocked: true, now: 5000 },
      { type: 'block', blocked: false, now: 8000 },
    )
    expect(timeLeft(state, 8000)).toBe(TOAST_DURATION)
  })

  test('Infinity keeps the clock from ever running out', () => {
    const state = run({ type: 'show', toast: toast(1, Infinity), now: 0 })
    expect(timeLeft(state, 1e12)).toBe(Infinity)
  })
})

describe('open-sheet registry', () => {
  afterEach(() => {
    expect(anyDialogOpen()).toBe(false)
  })

  test('tracks each dialog and notifies only on a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDialogs(listener)
    const [a, b] = [{}, {}]

    setDialogOpen(a, true)
    setDialogOpen(a, true)
    setDialogOpen(b, true)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(anyDialogOpen()).toBe(true)

    setDialogOpen(a, false)
    expect(anyDialogOpen()).toBe(true)
    setDialogOpen(b, false)
    setDialogOpen(b, false)
    expect(anyDialogOpen()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(4)

    unsubscribe()
    setDialogOpen(a, true)
    setDialogOpen(a, false)
    expect(listener).toHaveBeenCalledTimes(4)
  })
})

describe('menu placement', () => {
  const viewport = { width: 400, height: 800 }
  const avatar = { top: 8, bottom: 48, left: 340, right: 380 }
  const panel = { width: 220, height: 200 }

  test('under the trigger, right edges aligned', () => {
    expect(placeMenu(avatar, panel, viewport)).toEqual({
      top: avatar.bottom + MENU_GAP,
      left: avatar.right - panel.width,
      maxHeight: viewport.height - VIEWPORT_MARGIN - (avatar.bottom + MENU_GAP),
    })
  })

  test('start alignment, kept inside the viewport on both sides', () => {
    expect(placeMenu(avatar, panel, viewport, 'start').left).toBe(viewport.width - VIEWPORT_MARGIN - panel.width)
    const nearLeft = { top: 8, bottom: 48, left: 0, right: 40 }
    expect(placeMenu(nearLeft, panel, viewport).left).toBe(VIEWPORT_MARGIN)
    // Narrower than the panel: the start edge stays on screen.
    expect(placeMenu(avatar, panel, { width: 200, height: 800 }).left).toBe(VIEWPORT_MARGIN)
  })

  test('flips above when it fits only there', () => {
    const low = { top: 700, bottom: 740, left: 340, right: 380 }
    expect(placeMenu(low, panel, viewport)).toEqual({
      top: low.top - MENU_GAP - panel.height,
      left: low.right - panel.width,
      maxHeight: low.top - MENU_GAP - VIEWPORT_MARGIN,
    })
  })

  test('too tall for either side: the roomier side, scrolling within it', () => {
    const tall = { width: 220, height: 1000 }
    const high = placeMenu(avatar, tall, viewport)
    expect(high.top).toBe(avatar.bottom + MENU_GAP)
    expect(high.maxHeight).toBe(viewport.height - VIEWPORT_MARGIN - high.top)

    const low = placeMenu({ top: 700, bottom: 740, left: 340, right: 380 }, tall, viewport)
    expect(low.top).toBe(VIEWPORT_MARGIN)
    expect(low.top + low.maxHeight).toBe(700 - MENU_GAP)
  })
})

describe('Sheet markup', () => {
  const sheet = (props: Partial<Parameters<typeof Sheet>[0]> = {}) =>
    el(Sheet, { open: false, onClose: () => {}, title: 'Filters', children: 'Body', ...props })

  test('named by its title, closed until showModal()', () => {
    const html = render(sheet())
    const dialog = dialogTag(html)
    const id = attr(dialog, 'aria-labelledby')
    expect(id).toBeTruthy()
    expect(html).toContain(`<h2 id="${id}" class="ui-sheet__title">Filters</h2>`)
    // open is never rendered: showModal() makes it modal, the open attribute alone would not.
    expect(dialog).not.toContain(' open')
    expect(dialog).not.toContain('ui-sheet--footer')
  })

  test('the X button is named in the UI language', () => {
    expect(attr(tag(render(sheet()), 'ui-sheet__close'), 'aria-label')).toBe('Close')
    expect(attr(tag(render(sheet(), 'pl'), 'ui-sheet__close'), 'aria-label')).toBe('Zamknij')
    expect(attr(tag(render(sheet({ closeLabel: 'Close filters' })), 'ui-sheet__close'), 'aria-label')).toBe('Close filters')
  })

  test('a footer gets its slot and the scroll padding that goes with it', () => {
    const html = render(sheet({ footer: 'Actions' }))
    expect(dialogTag(html)).toContain('ui-sheet--footer')
    expect(html).toContain('<div class="ui-sheet__footer">Actions</div>')
  })
})

describe('Menu markup', () => {
  const trigger = (props: MenuTriggerProps) => jsx('button', { type: 'button', ...props, children: 'Account' })
  const html = render(
    jsxs(Menu, {
      trigger,
      header: 'ada@example.com',
      children: [
        jsxs(MenuGroup, {
          label: 'Theme',
          children: [
            jsx(MenuRadioItem, { checked: true, icon: Sun, children: 'Light' }),
            jsx(MenuRadioItem, { checked: false, children: 'Dark' }),
          ],
        }),
        el(MenuSeparator, {}),
        el(MenuItem, { href: './privacy', children: 'Privacy' }),
        el(MenuItem, { onSelect: () => {}, children: 'Sign out' }),
      ],
    }),
  )

  test('the trigger is a menu button wired to the menu', () => {
    const button = tag(html, 'aria-haspopup')
    expect(attr(button, 'aria-haspopup')).toBe('menu')
    expect(attr(button, 'aria-expanded')).toBe('false')
    const menu = tag(html, 'role="menu"')
    expect(attr(menu, 'id')).toBe(attr(button, 'aria-controls'))
    expect(attr(menu, 'aria-labelledby')).toBe(attr(button, 'id'))
  })

  test('the header is outside role=menu and describes it', () => {
    const menu = tag(html, 'role="menu"')
    const header = tag(html, 'ui-menu__header')
    expect(attr(header, 'id')).toBe(attr(menu, 'aria-describedby'))
    expect(html.indexOf('ada@example.com')).toBeLessThan(html.indexOf('role="menu"'))
  })

  test('items are menu items reached by arrow keys; none is a tab stop until focused', () => {
    const items = [...html.matchAll(/<(?:button|a)[^>]*role="menuitem(?:radio)?"[^>]*>/g)].map((match) => match[0])
    expect(items).toHaveLength(4)
    for (const item of items) expect(attr(item, 'tabindex')).toBe('-1')
    expect(items.map((item) => attr(item, 'aria-checked'))).toEqual(['true', 'false', undefined, undefined])
    expect(items[2]).toMatch(/^<a /)
    expect(attr(items[2], 'href')).toBe('./privacy')
  })

  test('the group is named by its visible label; the separator is a separator', () => {
    const group = tag(html, 'role="group"')
    expect(html).toContain(`<div id="${attr(group, 'aria-labelledby')}" class="ui-menu__label">Theme</div>`)
    expect(html).toContain('<div role="separator" class="ui-menu__separator"></div>')
  })

  test('server markup is the hidden fallback panel; the client upgrades to a popover', () => {
    const panel = tag(html, 'ui-menu__panel')
    expect(panel).toContain('hidden=""')
    expect(panel).not.toContain('popover')
  })
})

describe('Toaster markup', () => {
  test('a polite live region with no role, empty until a toast shows', () => {
    const html = render(el(ToastProvider, { children: jsx('main', { children: 'App' }) }))
    expect(html).toMatch(/^<main>App<\/main><div class="ui-toaster">/)
    expect(html).toContain('<div class="visually-hidden" aria-live="polite"></div>')
    expect(html).not.toContain('role=')
    expect(html).not.toContain('ui-toast"')
  })

  test('useToast needs the provider', () => {
    const Orphan = () => {
      useToast()
      return null
    }
    expect(() => render(el(Orphan, {}))).toThrow(/ToastProvider/)
  })
})
