import { createContext, use, useLayoutEffect } from 'react'

// A view drawn over the whole page (the phone details, §4.8) leaves the page mounted under
// it, inert and hidden from assistive tech. AppShell provides the switch; it flips the
// attributes on the DOM at once rather than through state, so whoever closes the view can
// move focus back into the page in the same commit (an inert element can't take focus).
export const PageCoverContext = createContext<(covered: boolean) => void>(() => {})

// While `active`, everything AppShell draws is inert: the app bar, the skip link and the
// list. The covering view must render outside it (a portal to <body>), or it goes inert too.
export function useCoverPage(active: boolean) {
  const setCovered = use(PageCoverContext)
  useLayoutEffect(() => {
    if (!active) return
    setCovered(true)
    return () => setCovered(false)
  }, [active, setCovered])
}
