// Where a menu panel goes. CSS anchor positioning is above the browser floor (§3), so the
// panel is position:fixed and placed from measured rects: under the trigger, flipped above
// when it fits there better, and kept inside the viewport.

export interface Box {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Size {
  width: number
  height: number
}

export type MenuAlign = 'start' | 'end'

export interface Placement {
  top: number
  left: number
  // The space on the chosen side; a taller panel scrolls within it.
  maxHeight: number
}

// Between the trigger and the panel, and between the panel and the viewport edge.
export const MENU_GAP = 4
export const VIEWPORT_MARGIN = 8

export function placeMenu(trigger: Box, panel: Size, viewport: Size, align: MenuAlign = 'end'): Placement {
  const preferred = align === 'end' ? trigger.right - panel.width : trigger.left
  const maxLeft = viewport.width - VIEWPORT_MARGIN - panel.width
  // Clamped right first, then left: on a viewport narrower than the panel the start edge wins.
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferred, maxLeft))

  const below = trigger.bottom + MENU_GAP
  const spaceBelow = viewport.height - VIEWPORT_MARGIN - below
  const spaceAbove = trigger.top - MENU_GAP - VIEWPORT_MARGIN
  if (panel.height <= spaceBelow || spaceBelow >= spaceAbove) {
    return { top: below, left, maxHeight: Math.max(0, spaceBelow) }
  }
  return { top: trigger.top - MENU_GAP - Math.min(panel.height, spaceAbove), left, maxHeight: spaceAbove }
}

// Popover API: Chrome 114, Safari 17, Firefox 125. The floor has Firefox 120, which gets
// the toggled-element fallback.
export function supportsPopover(): boolean {
  return typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype
}
