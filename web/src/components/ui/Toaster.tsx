import { X } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { useI18n } from '../../i18n'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { anyDialogOpen, subscribeDialogs } from './openDialogs'
import {
  INITIAL_TOAST_STATE,
  TOAST_DURATION,
  ToastContext,
  toastReducer,
  type Toast,
  type ToastApi,
  type ToastOptions,
} from './toast'
import './Toaster.css'

let nextId = 0

const now = () => performance.now()

// Wraps the app (inside I18nProvider) and gives it useToast(). One toast at a time (§4.9):
// phone above the action bar (--actionbar-h, Toaster.css), desktop bottom right. While visible it sets
// --toast-h on <html>, which scrolling panes add to their scroll-padding-bottom, so the
// toast never hides the focused control (WCAG 2.4.11).
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [state, dispatch] = useReducer(toastReducer, INITIAL_TOAST_STATE)
  // Toasts wait while a sheet is open (openDialogs.ts says why).
  const blocked = useSyncExternalStore(subscribeDialogs, anyDialogOpen, () => false)
  const cardRef = useRef<HTMLDivElement>(null)
  const held = useRef({ hover: false, focus: false })
  // Where focus was before it entered the toast: put back when a button there closes it,
  // instead of letting it drop to <body>.
  const returnFocus = useRef<HTMLElement | null>(null)

  const api = useMemo<ToastApi>(
    () => ({
      show: (options: ToastOptions) => {
        const toast: Toast = { ...options, id: ++nextId, duration: options.duration ?? TOAST_DURATION }
        dispatch({ type: 'show', toast, now: now() })
        return toast.id
      },
      dismiss: (id) => dispatch({ type: 'dismiss', id }),
    }),
    [],
  )

  useLayoutEffect(() => {
    dispatch({ type: 'block', blocked, now: now() })
  }, [blocked])

  const current = state.toast && !blocked ? state.toast : null

  // The last toast stays painted, inert, while its exit transition runs.
  const [leaving, setLeaving] = useState<Toast | null>(null)
  const [last, setLast] = useState<Toast | null>(null)
  if (current !== last) {
    setLast(current)
    setLeaving(current ? null : last)
  }
  const shown = current ?? leaving

  useEffect(() => {
    const card = cardRef.current
    if (!leaving || !card) return
    let cancelled = false
    const finish = () => {
      if (!cancelled) setLeaving(null)
    }
    // Resolves at once when nothing animates (no transition support, or none declared).
    Promise.all(card.getAnimations().map((animation) => animation.finished)).then(finish, finish)
    return () => {
      cancelled = true
    }
  }, [leaving])

  // The clock (toast.ts) only says how long is left; this turns it into a timer.
  useEffect(() => {
    const toast = state.toast
    if (!toast || state.since === null || !Number.isFinite(state.remaining)) return
    const timer = setTimeout(() => dispatch({ type: 'dismiss', id: toast.id }), state.remaining)
    return () => clearTimeout(timer)
  }, [state.toast, state.since, state.remaining])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!current || !card) return
    // A new toast can appear under a resting pointer or around focus; read both afresh.
    held.current = { hover: card.matches(':hover'), focus: card.contains(document.activeElement) }
    dispatch({ type: 'pause', paused: held.current.hover || held.current.focus, now: now() })

    const root = document.documentElement
    const measure = () => root.style.setProperty('--toast-h', `${card.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(card)
    return () => {
      observer.disconnect()
      root.style.setProperty('--toast-h', '0px')
    }
  }, [current])

  const hold = (reason: 'hover' | 'focus', on: boolean) => {
    held.current = { ...held.current, [reason]: on }
    dispatch({ type: 'pause', paused: held.current.hover || held.current.focus, now: now() })
  }

  const close = (toast: Toast, then?: () => void) => {
    const target = returnFocus.current
    if (cardRef.current?.contains(document.activeElement) && target?.isConnected) target.focus()
    dispatch({ type: 'dismiss', id: toast.id })
    then?.()
  }

  // Focus moving in from outside the toast, or out of it; not between its own buttons.
  const crossesEdge = (event: FocusEvent<HTMLDivElement>) =>
    !event.currentTarget.contains(event.relatedTarget as Node | null)

  return (
    <ToastContext value={api}>
      {children}
      <div className="ui-toaster">
        {/* The live region is always mounted (an inserted one may go unannounced) and holds
            only the message; no role, as each view keeps role=status for itself (§4.2).
            The key makes a repeated message a new node, so it is announced again. */}
        <div className="visually-hidden" aria-live="polite">
          {current && <span key={current.id}>{current.message}</span>}
        </div>
        {shown && (
          <div
            ref={cardRef}
            className="ui-toast"
            data-state={current ? 'open' : 'closed'}
            inert={!current}
            onPointerEnter={() => hold('hover', true)}
            onPointerLeave={() => hold('hover', false)}
            onFocus={(event) => {
              if (!crossesEdge(event)) return
              returnFocus.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
              hold('focus', true)
            }}
            onBlur={(event) => {
              if (crossesEdge(event)) hold('focus', false)
            }}
          >
            {/* Read through the live region above, so not twice. */}
            <p className="ui-toast__message" aria-hidden="true">
              {shown.message}
            </p>
            {shown.actionLabel && shown.onAction && (
              <Button
                variant="ghost"
                size="sm"
                className="ui-toast__action"
                onClick={() => close(shown, shown.onAction)}
              >
                {shown.actionLabel}
              </Button>
            )}
            <IconButton
              icon={X}
              size="sm"
              aria-label={t.common.dismiss}
              className="ui-toast__dismiss"
              onClick={() => close(shown)}
            />
          </div>
        )}
      </div>
    </ToastContext>
  )
}
