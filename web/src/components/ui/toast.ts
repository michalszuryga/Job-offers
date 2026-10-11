import { createContext, use } from 'react'

// Toast state, kept pure so the rules (§4.9) are unit-tested without a DOM: one slot (a new
// toast replaces the old one), a clock that runs only while the toast can be seen and isn't
// hovered or focused, and a wait while a sheet is open. Toaster.tsx renders it.

export const TOAST_DURATION = 6000

export interface ToastOptions {
  // Plain sentence, e.g. "Status: Applied".
  message: string
  // One action, e.g. "Undo" or "Retry". Shown only together with onAction.
  actionLabel?: string
  onAction?: () => void
  // Milliseconds of visible, unattended time. Infinity keeps it until dismissed.
  duration?: number
}

export interface Toast {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
  duration: number
}

export interface ToastState {
  // The latest toast, on screen or waiting.
  toast: Toast | null
  // A sheet is open: the toast waits behind it.
  blocked: boolean
  // Pointer over it or focus inside it: the reader is still busy with it.
  paused: boolean
  // Milliseconds left as of `since`, or as of when the clock stopped.
  remaining: number
  // When the clock last started; null while it is stopped.
  since: number | null
}

export type ToastAction =
  | { type: 'show'; toast: Toast; now: number }
  // Without an id: whatever is showing. With one: only that toast, so a stale timer can't
  // close its replacement.
  | { type: 'dismiss'; id?: number }
  | { type: 'block'; blocked: boolean; now: number }
  | { type: 'pause'; paused: boolean; now: number }

export const INITIAL_TOAST_STATE: ToastState = { toast: null, blocked: false, paused: false, remaining: 0, since: null }

const running = (state: ToastState) => state.toast !== null && !state.blocked && !state.paused

// Starts or stops the clock to match the new state.
const clock = (state: ToastState, now: number): ToastState => ({ ...state, since: running(state) ? now : null })

export function timeLeft(state: ToastState, now: number): number {
  return state.since === null ? state.remaining : Math.max(0, state.remaining - (now - state.since))
}

export function toastReducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case 'show':
      // Hover and focus are re-read from the DOM for the new toast (Toaster.tsx): the old
      // toast's pointerleave may never come if it vanished under a still pointer.
      return clock({ ...state, toast: action.toast, paused: false, remaining: action.toast.duration }, action.now)
    case 'dismiss':
      if (!state.toast || (action.id !== undefined && action.id !== state.toast.id)) return state
      return { ...state, toast: null, paused: false, remaining: 0, since: null }
    case 'block':
      if (action.blocked === state.blocked) return state
      // Hidden behind a sheet it has not been read, so it comes back with its full time.
      return clock({ ...state, blocked: action.blocked, remaining: state.toast?.duration ?? 0 }, action.now)
    case 'pause':
      if (action.paused === state.paused) return state
      return clock({ ...state, paused: action.paused, remaining: timeLeft(state, action.now) }, action.now)
  }
}

export interface ToastApi {
  // Shows a toast, replacing any current one; returns its id for dismiss().
  show: (options: ToastOptions) => number
  dismiss: (id?: number) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const value = use(ToastContext)
  if (!value) throw new Error('useToast() needs a <ToastProvider> above it')
  return value
}
