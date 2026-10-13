import { useEffect } from 'react'
import { navigate, useLocationProperty } from 'wouter/use-browser-location'
import { shortcutsEnabled } from './shortcuts'

// ?offer=<id> (plan §4.1): the open offer lives in the URL, so a deep link, a reload and the
// back gesture all agree with the screen. popstate drives React state, never the reverse.
const PARAM = 'offer'
// Marks an entry this tab pushed by opening an offer from the list, so closing it can go back
// to the list entry rather than stack a new one. A cold deep link has no such entry behind it.
const FLAG = 'joffersOffer'

export function offerIdFrom(search: string): string | null {
  return new URLSearchParams(search).get(PARAM) || null
}

// The same path with one param set, or removed for null. Other params stay; the fragment goes.
// URLSearchParams encodes the value, so external ids (URLs with their own ?, & and %) survive.
function withParam(href: string, name: string, value: string | null): string {
  const url = new URL(href)
  if (value == null) url.searchParams.delete(name)
  else url.searchParams.set(name, value)
  return url.pathname + url.search
}

export function withOffer(href: string, id: string | null): string {
  return withParam(href, PARAM, id)
}

// ?view=new, the daily e-mail's "Open JOffers" link (§4.1): opens the New view once.
const VIEW = 'view'

export function viewFrom(search: string): string | null {
  return new URLSearchParams(search).get(VIEW)
}

export function withoutView(href: string): string {
  return withParam(href, VIEW, null)
}

// Drops ?view= in place (replace, keeping the entry's state) once it has been read, so a
// reload or a copied link doesn't keep forcing the view.
export function clearView() {
  if (viewFrom(location.search) != null) navigate(withoutView(location.href), { replace: true, state: history.state })
}

export function isPushedOffer(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>)[FLAG] === true
}

// Straight from location, not wouter's useSearch: that one runs decodeURI over the string,
// which turns an id's own %25 into a bare %.
const currentSearch = () => location.search
const noSearch = () => ''

export function openOffer(id: string) {
  const open = offerIdFrom(location.search)
  if (open === id) return
  const to = withOffer(location.href, id)
  // Switching while open replaces (keeping the flag), so back still lands on the list.
  if (open != null) navigate(to, { replace: true, state: history.state })
  else navigate(to, { state: { [FLAG]: true } })
}

// history.back() is asynchronous: until its popstate the URL still shows the offer, so a
// second close in the meantime (a double tap, two quick Esc presses) would go back twice and
// leave the list, or the site.
let closing = false
const closed = () => {
  closing = false
}

export function closeOffer() {
  if (closing || offerIdFrom(location.search) == null) return
  if (isPushedOffer(history.state)) {
    closing = true
    window.addEventListener('popstate', closed, { once: true })
    // Back into another document (the list entry from before a reload) fires no popstate
    // here, and the bfcache may bring this page back with the flag still set.
    window.addEventListener('pageshow', closed, { once: true })
    history.back()
  } else {
    navigate(withOffer(location.href, null), { replace: true, state: history.state })
  }
}

export function useOfferParam() {
  const offerId = offerIdFrom(useLocationProperty(currentSearch, noSearch))
  return { offerId, openOffer, closeOffer }
}

// A menu or dialog above the details takes Esc for itself. Both kinds are display:none when
// closed (popover or not), so visibility tells an open one apart.
function overlayOpen(): boolean {
  if (document.querySelector('dialog[open]')) return true
  return [...document.querySelectorAll('[role="menu"]')].some((menu) => menu.checkVisibility())
}

// Keys typed into a field, or picking an option in a select, are never shortcuts.
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))
}

// A single-key shortcut while `active`, e.g. x for "Not for me" in the details: no modifiers,
// no auto-repeat (holding x must not dismiss a run of offers), and never while typing, under
// an open menu or dialog, or with shortcuts turned off (lib/shortcuts.ts). Shift is allowed:
// it is how ? is typed.
export function useKeyShortcut(key: string, active: boolean, run: () => void) {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key || event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event.target) || overlayOpen()) return
      if (!shortcutsEnabled()) return
      event.preventDefault()
      run()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [key, active, run])
}

// Esc closes the details (§4.1) unless something already handled it.
export function useEscapeToClose(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || overlayOpen()) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, close])
}
