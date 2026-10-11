import type { ChoiceOption, SelectItem } from '../components/ui'
import type { Lang, Messages } from '../i18n'
import type { SortKey } from '../lib/format'
import { STATUS_GROUPS } from '../lib/status'

// Sample data shared by the kit's sections. Labels the app doesn't have in i18n yet
// (the "New" window arrives in P6, the theme menu in P5) are literal: this is dev-only.

export type KitTheme = 'auto' | 'light' | 'dark'

export const THEMES: readonly ChoiceOption<KitTheme>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

// The head script may already have forced one from the app's saved choice.
export function currentTheme(): KitTheme {
  const theme = document.documentElement.dataset.theme
  return theme === 'light' || theme === 'dark' ? theme : 'auto'
}

// Not saved: the kit must not change the theme the app starts with.
export function applyTheme(theme: KitTheme) {
  const root = document.documentElement
  if (theme === 'auto') delete root.dataset.theme
  else root.dataset.theme = theme
}

// Each language in its own name, as language pickers show them.
export const LANG_NAMES: Record<Lang, string> = { en: 'English', pl: 'Polski' }

// §4.5 toolbar, default New.
export const PUBLISHED: readonly ChoiceOption<string>[] = [
  { value: 'new', label: 'New' },
  { value: '24h', label: '24 h' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: 'any', label: 'Any time' },
]

// §4.6, the same presets as the score bands.
export const MIN_SCORE: readonly ChoiceOption<number>[] = [
  { value: 0, label: 'Any score' },
  { value: 50, label: '50+' },
  { value: 65, label: '65+' },
  { value: 80, label: '80+' },
]

export const SCORES = [92, 75, 55, 30, null] as const

// The nine statuses in their pipeline optgroups (§2.4), optionally after "All statuses".
export function statusItems(t: Messages, withAll: boolean): SelectItem[] {
  const groups = STATUS_GROUPS.map((group) => ({
    label: t.statusGroups[group.key],
    options: group.statuses.map((status) => ({ value: status, label: t.status[status] })),
  }))
  return withAll ? [{ value: 'ALL', label: t.filters.allStatuses }, ...groups] : groups
}

const SORT_KEYS: readonly SortKey[] = ['score', 'newest', 'salary']

export function sortItems(t: Messages): SelectItem[] {
  return SORT_KEYS.map((key) => ({ value: key, label: t.filters.sort[key] }))
}

// Fictional boards: real names stay off every page until the legal review (§8).
export function sourceItems(t: Messages): SelectItem[] {
  return [
    { value: 'ALL', label: t.filters.allSources },
    ...['Board A', 'Board B', 'Board C'].map((name) => ({ value: name, label: name })),
  ]
}
