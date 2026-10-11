// Which modal sheets are open right now: Sheet reports here, the Toaster subscribes.
// Toasts wait while one is open (§4.9): a modal dialog makes everything outside it inert,
// so a toast's buttons and its live region would be unreachable behind the backdrop.
// A registry rather than a MutationObserver on dialog[open]: no document-wide observer
// firing on every list render, and it works the same in SSR and unit tests. A modal that
// isn't a Sheet (e.g. the P9 shortcuts dialog) calls setDialogOpen itself.

const open = new Set<object>()
const listeners = new Set<() => void>()

export function setDialogOpen(dialog: object, isOpen: boolean): void {
  if (open.has(dialog) === isOpen) return
  if (isOpen) open.add(dialog)
  else open.delete(dialog)
  for (const listener of listeners) listener()
}

export function anyDialogOpen(): boolean {
  return open.size > 0
}

// useSyncExternalStore(subscribeDialogs, anyDialogOpen, () => false)
export function subscribeDialogs(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
