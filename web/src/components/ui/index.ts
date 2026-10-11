// The UI kit (plan §3, P4): screens import from here, never from the parts.
// Each component keeps its own .css, imported by the component, so only what a route
// uses reaches its bundle: package.json declares every module but CSS free of side effects,
// else importing one name from here would pull in every part's stylesheet. Like the i18n
// barrel this defines nothing itself, so the Fast Refresh rule has nothing to protect here.
/* oxlint-disable react/only-export-components */
export { cx } from './cx'
export { Icon } from './Icon'
export { VisuallyHidden } from './VisuallyHidden'
export { Logo } from './Logo'

// Controls
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button'
export { IconButton } from './IconButton'
export { Field, type FieldControlProps } from './Field'
export { TextField, type TextFieldProps } from './TextField'
export { Select, type SelectGroup, type SelectItem, type SelectOption } from './Select'
export { SegmentedControl, type ChoiceOption, type ChoiceValue } from './SegmentedControl'
export { RadioChips } from './RadioChips'
export { Kbd } from './Kbd'

// Display
export { Badge, type BadgeTone } from './Badge'
export { StatusPill } from './StatusPill'
export { ScoreRing } from './ScoreRing'
export { ScoreBar, type ScoreBarTone } from './ScoreBar'
export { Skeleton, SkeletonCard, type SkeletonShape } from './Skeleton'
export { EmptyState } from './EmptyState'
export { Callout, type CalloutTone } from './Callout'

// Overlays
export { Sheet } from './Sheet'
export { Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator, type MenuTriggerProps } from './Menu'
export { ToastProvider } from './Toaster'
export { useToast, type ToastOptions } from './toast'
// For a modal that isn't a Sheet (e.g. the P9 shortcuts dialog): toasts wait while it is open.
export { setDialogOpen } from './openDialogs'
