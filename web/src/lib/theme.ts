import { useSyncExternalStore } from 'react'

// The theme choice in the account menu (§4.4): Auto follows the system, Light and Dark force
// one. Same key and rules as the inline head script in index.html, which applies a saved
// choice before first paint; this applies a new one live, the way that script does.
export const THEME_KEY = 'joffers-theme'
export const THEME_PREFS = ['auto', 'light', 'dark'] as const
export type ThemePref = (typeof THEME_PREFS)[number]
type Scheme = Exclude<ThemePref, 'auto'>
export type ThemeColors = Record<Scheme, string>

// Only 'light' | 'dark' force a theme; nothing saved, or anything else, is auto.
export function parseThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

// <meta name="color-scheme">: index.html's 'light dark', or the forced scheme alone.
export function colorSchemeFor(pref: ThemePref): string {
  return pref === 'auto' ? 'light dark' : pref
}

// A <meta name="theme-color"> by its media query: on auto each keeps its own scheme's colour,
// a forced theme gives both the same one, so the browser UI matches the page either way.
export function themeColorFor(pref: ThemePref, media: string | null, colors: ThemeColors): string {
  if (pref !== 'auto') return colors[pref]
  return colors[/dark/.test(media ?? '') ? 'dark' : 'light']
}

// Computed colours come back as rgb channels; the head script writes #RRGGBB, as tokens.css
// spells them, so a live switch leaves the same meta values a reload would. Anything else
// (a colour with alpha, another colour space) is returned as it came.
export function toHex(computed: string): string {
  const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(computed)
  if (!channels) return computed
  const hex = channels.slice(1).map((channel) => Number(channel).toString(16).padStart(2, '0'))
  return `#${hex.join('')}`.toUpperCase()
}

// The app bar's --surface in one scheme, resolved from tokens.css: the colours the head
// script's map mirrors (theme.test and brand.spec keep the two equal), so none is copied here.
function surfaceColor(scheme: Scheme): string {
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;visibility:hidden;color-scheme:${scheme};background-color:var(--surface)`
  document.body.append(probe)
  const color = getComputedStyle(probe).backgroundColor
  probe.remove()
  return toHex(color)
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', colorSchemeFor(pref))
  const colors = { light: surfaceColor('light'), dark: surfaceColor('dark') }
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', themeColorFor(pref, meta.getAttribute('media'), colors))
  }
}

function readStored(): ThemePref {
  try {
    return parseThemePref(globalThis.localStorage?.getItem(THEME_KEY))
  } catch {
    // Blocked storage: whatever the head script (or an earlier switch) applied.
    return parseThemePref(globalThis.document?.documentElement.dataset.theme)
  }
}

// Kept here as well as in storage, so the menu still follows a switch when storage is blocked.
let current: ThemePref | null = null
const listeners = new Set<() => void>()

export function getThemePref(): ThemePref {
  current ??= readStored()
  return current
}

export function setThemePref(pref: ThemePref): void {
  try {
    // Auto is the default, so it leaves nothing behind.
    if (pref === 'auto') globalThis.localStorage?.removeItem(THEME_KEY)
    else globalThis.localStorage?.setItem(THEME_KEY, pref)
  } catch {
    // Not remembered, but this page still switches.
  }
  applyTheme(pref)
  current = pref
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, getThemePref, () => 'auto')
}
