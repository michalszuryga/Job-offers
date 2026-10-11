import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  // 16 inline with text, 20 inside buttons (plan §2.7).
  size?: 16 | 20 | 24
  className?: string
}

// Icons are decoration: the surrounding text or the button's aria-label names the action.
export function Icon({ icon: Glyph, size = 16, className }: Props) {
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" className={className} />
}
