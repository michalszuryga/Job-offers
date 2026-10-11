import { useCallback, useSyncExternalStore } from 'react'

// Live matchMedia, for layouts that mount different components per breakpoint (§4.7:
// responsive duplicates are mounted conditionally, never just hidden with CSS).
// Server render and the first paint without matchMedia count as no match (phone first).
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false)
}
