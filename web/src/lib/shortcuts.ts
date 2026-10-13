import { useSyncExternalStore } from 'react'

// Keyboard shortcuts (§4.7, §5): on unless turned off in the shortcuts dialog, a choice this
// device keeps. Only '0' (off) is ever stored; nothing saved, or anything else, means on.
export const SHORTCUTS_KEY = 'joffers-shortcuts'

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Storage can throw (blocked); shortcuts then stay on, and a change lasts for this page only.
let override: boolean | null = null

export function shortcutsEnabled(): boolean {
  if (override != null) return override
  try {
    return globalThis.localStorage?.getItem(SHORTCUTS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setShortcutsEnabled(on: boolean): void {
  override = on
  try {
    if (on) localStorage.removeItem(SHORTCUTS_KEY)
    else localStorage.setItem(SHORTCUTS_KEY, '0')
    override = null
  } catch {
    // Kept in `override` instead.
  }
  notify()
}

export function useShortcutsEnabled(): boolean {
  return useSyncExternalStore(subscribe, shortcutsEnabled, () => true)
}

// The shortcuts dialog: opened by ?, the account menu or the hints under the summary, and
// shown by the offers page, which owns the keys it lists.
let helpOpen = false

export function setShortcutsHelp(open: boolean): void {
  if (helpOpen === open) return
  helpOpen = open
  notify()
}

export function useShortcutsHelp(): boolean {
  return useSyncExternalStore(subscribe, () => helpOpen, () => false)
}
