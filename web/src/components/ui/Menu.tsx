import { Check, type LucideIcon } from 'lucide-react'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { cx } from './cx'
import { Icon } from './Icon'
import { placeMenu, supportsPopover, type MenuAlign } from './menuPlacement'
import './Menu.css'

// Spread onto the trigger button: <IconButton {...props} icon={User} aria-label="Account" />.
export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>
  id: string
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
  'aria-controls': string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onPointerDown: () => void
}

interface MenuProps {
  trigger: (props: MenuTriggerProps) => ReactNode
  // Non-interactive text above the items, e.g. the signed-in email. It sits outside role=menu
  // (which may only own items) and becomes the menu's description.
  header?: ReactNode
  // The menu's name; the trigger's name by default.
  label?: string
  // Which trigger edge the panel lines up with; 'end' hangs it under the right edge.
  align?: MenuAlign
  className?: string
  children: ReactNode
}

interface MenuContextValue {
  close: (focusTrigger: boolean) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

const ITEMS = '[role^="menuitem"]'
const noSubscribe = () => () => {}
const onClient = () => true
const onServer = () => false

// APG menu button. The panel is a popover="auto" (top layer, light dismiss) where the
// browser has the Popover API, else an element toggled by React that closes on an outside
// press, Esc or focus leaving. Placed with measured rects (menuPlacement.ts).
export function Menu({ trigger, header, label, align = 'end', className, children }: MenuProps) {
  // Server and hydration render the fallback in place, the client then switches, so markup matches.
  const native = useSyncExternalStore(noSubscribe, supportsPopover, onServer)
  // The fallback panel goes to <body>: inside a sticky app bar its z-index would only count
  // within the bar's stacking context, under any later sticky sibling (the toolbar).
  const portal = useSyncExternalStore(noSubscribe, onClient, onServer) && !native
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Open state as the trigger's pointerdown saw it: light dismiss closes the popover on that
  // press's pointerup, so by click time a press meant to close it would reopen it.
  const openAtPress = useRef<boolean | null>(null)
  const id = useId()
  const triggerId = `${id}-trigger`
  const menuId = `${id}-menu`
  const headerId = `${id}-header`

  // The panel is outside the root's DOM when portalled.
  const owns = useCallback((node: EventTarget | null) => {
    if (!(node instanceof Node)) return false
    return !!(rootRef.current?.contains(node) || panelRef.current?.contains(node))
  }, [])

  const isOpen = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return false
    return native ? panel.matches(':popover-open') : !panel.hidden
  }, [native])

  const place = useCallback(() => {
    const panel = panelRef.current
    const button = triggerRef.current
    if (!panel || !button) return
    // Measured at the origin first: the offset found there corrects for any ancestor that
    // makes a containing block for fixed elements (transform, filter) in the fallback.
    // Unclamping it for the measure resets its scroll, which is put back once clamped again.
    const scrolled = panel.scrollTop
    panel.style.maxHeight = ''
    panel.style.top = '0px'
    panel.style.left = '0px'
    const origin = panel.getBoundingClientRect()
    const root = document.documentElement
    const spot = placeMenu(
      button.getBoundingClientRect(),
      { width: origin.width, height: origin.height },
      { width: root.clientWidth, height: root.clientHeight },
      align,
    )
    panel.style.top = `${spot.top - origin.top}px`
    panel.style.left = `${spot.left - origin.left}px`
    panel.style.maxHeight = `${spot.maxHeight}px`
    panel.scrollTop = scrolled
  }, [align])

  const focusItem = (which: 'first' | 'last') => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(ITEMS)
    if (items?.length) items[which === 'first' ? 0 : items.length - 1].focus()
  }

  const openMenu = (which: 'first' | 'last') => {
    const panel = panelRef.current
    if (!panel) return
    // Synchronous on both paths, so it is placed and focused before the first paint.
    // showPopover() throws on a popover that is already open.
    if (native && !panel.matches(':popover-open')) panel.showPopover()
    flushSync(() => setOpen(true))
    place()
    focusItem(which)
  }

  const close = useCallback(
    (focusTrigger: boolean) => {
      const panel = panelRef.current
      // No tab stop left behind: Tab from the menu goes past the trigger, never back in.
      for (const item of menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []) item.tabIndex = -1
      if (native && panel?.matches(':popover-open')) panel.hidePopover()
      setOpen(false)
      if (focusTrigger) triggerRef.current?.focus()
    },
    [native],
  )

  // Light dismiss and the browser's own Esc close the popover without asking; follow it.
  useEffect(() => {
    const panel = panelRef.current
    if (!native || !panel) return
    const onToggle = (event: Event) => setOpen((event as ToggleEvent).newState === 'open')
    panel.addEventListener('toggle', onToggle)
    return () => panel.removeEventListener('toggle', onToggle)
  }, [native])

  // While open: follow the trigger on scroll and resize; the fallback also closes on an
  // outside press (the popover does that itself).
  useEffect(() => {
    if (!open) return
    let frame = 0
    const follow = (event: Event) => {
      // The panel's own scrolling (wheel, touch, focus moving down a long menu) moves no trigger.
      if (event.type === 'scroll' && panelRef.current?.contains(event.target as Node)) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(place)
    }
    const pressOutside = (event: PointerEvent) => {
      if (!owns(event.target)) close(false)
    }
    window.addEventListener('resize', follow)
    window.addEventListener('scroll', follow, { capture: true, passive: true })
    if (!native) document.addEventListener('pointerdown', pressOutside, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', follow)
      window.removeEventListener('scroll', follow, { capture: true })
      document.removeEventListener('pointerdown', pressOutside, true)
    }
  }, [open, native, place, close, owns])

  const triggerProps: MenuTriggerProps = {
    ref: triggerRef,
    id: triggerId,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': menuId,
    onPointerDown: () => {
      openAtPress.current = isOpen()
    },
    onClick: (event) => {
      const pressed = openAtPress.current
      openAtPress.current = null
      // detail is 0 for Enter/Space, which have no press (and may follow a stale one).
      const wasOpen = event.detail > 0 && pressed !== null ? pressed : isOpen()
      if (wasOpen) close(false)
      else openMenu('first')
    },
    onKeyDown: (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
    },
  }

  // Roving tabindex (APG): the focused item is the menu's one tab stop, so a panel that
  // has to scroll on a short screen still holds keyboard-reachable content.
  const onMenuFocus = (event: FocusEvent<HTMLDivElement>) => {
    for (const item of menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []) {
      item.tabIndex = item === event.target ? 0 : -1
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(at + 1)
      case 'ArrowUp':
        return move(at < 0 ? -1 : at - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(-1)
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        return close(true)
      case 'Tab':
        // Leaves the menu like the trigger would: Tab goes on past it, Shift+Tab lands on it.
        if (event.shiftKey) event.preventDefault()
        return close(true)
    }
  }

  const menuPanel = (
    <div
      ref={panelRef}
      className="ui-menu__panel"
      popover={native ? 'auto' : undefined}
      hidden={native ? undefined : !open}
    >
      {header != null && (
        <div className="ui-menu__header" id={headerId}>
          {header}
        </div>
      )}
      <div
        ref={menuRef}
        role="menu"
        id={menuId}
        aria-label={label}
        aria-labelledby={label ? undefined : triggerId}
        aria-describedby={header != null ? headerId : undefined}
        className="ui-menu__list"
        onFocus={onMenuFocus}
        onKeyDown={onMenuKeyDown}
      >
        {children}
      </div>
    </div>
  )

  return (
    <MenuContext value={{ close }}>
      <div
        ref={rootRef}
        className={cx('ui-menu', className)}
        // React events bubble here from the portalled panel too.
        onBlur={(event) => {
          // Focus moved somewhere else on the page (not just lost to a click on nothing).
          const next = event.relatedTarget
          if (open && next && !owns(next)) close(false)
        }}
      >
        {trigger(triggerProps)}
        {portal ? createPortal(menuPanel, document.body) : menuPanel}
      </div>
    </MenuContext>
  )
}

interface ItemProps {
  icon?: LucideIcon
  // Runs before the menu closes and focus returns to the trigger.
  onSelect?: () => void
  // Makes the item a link (still role=menuitem); navigation follows the click.
  href?: string
  // Focusable but inert, as the APG recommends, so it can still be discovered.
  disabled?: boolean
  className?: string
  children: ReactNode
}

function useSelect(onSelect: (() => void) | undefined, disabled: boolean | undefined) {
  const menu = use(MenuContext)
  return (event: MouseEvent) => {
    if (disabled) {
      event.preventDefault()
      return
    }
    onSelect?.()
    menu?.close(true)
  }
}

export function MenuItem({ icon, onSelect, href, disabled, className, children }: ItemProps) {
  const select = useSelect(onSelect, disabled)
  const content = (
    <>
      {icon && <Icon icon={icon} size={20} className="ui-menu__icon" />}
      <span className="ui-menu__text">{children}</span>
    </>
  )
  const shared = {
    role: 'menuitem',
    tabIndex: -1,
    'aria-disabled': disabled || undefined,
    className: cx('ui-menu__item', className),
    onClick: select,
  }
  if (href !== undefined) {
    return (
      <a {...shared} href={href}>
        {content}
      </a>
    )
  }
  return (
    <button type="button" {...shared}>
      {content}
    </button>
  )
}

interface RadioItemProps extends Omit<ItemProps, 'href'> {
  checked: boolean
}

// One choice of several, e.g. Theme: Auto / Light / Dark. The tick is drawn as well as
// announced, so the choice never rests on colour.
export function MenuRadioItem({ icon, onSelect, disabled, checked, className, children }: RadioItemProps) {
  const select = useSelect(onSelect, disabled)
  return (
    <button
      type="button"
      role="menuitemradio"
      tabIndex={-1}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={cx('ui-menu__item', className)}
      onClick={select}
    >
      {icon && <Icon icon={icon} size={20} className="ui-menu__icon" />}
      <span className="ui-menu__text">{children}</span>
      <Icon icon={Check} size={16} className="ui-menu__check" />
    </button>
  )
}

interface GroupProps {
  // Shown above the items and names the group, e.g. "Theme".
  label: string
  children: ReactNode
}

export function MenuGroup({ label, children }: GroupProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="ui-menu__group">
      <div id={id} className="ui-menu__label">
        {label}
      </div>
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="ui-menu__separator" />
}
