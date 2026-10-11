import type { ChoiceOption, SelectItem } from '../../components/ui'
import type { Messages } from '../../i18n'
import { MIN_SCORES, PUBLISHED_WINDOWS, SORT_KEYS, type MinScore, type PublishedWindow } from '../../lib/prefs'
import { STATUS_GROUPS } from '../../lib/status'

// Option lists for the filter controls, from the i18n copy. Shared by the toolbar, the
// Filters sheet and the chips row, so a label reads the same everywhere.

export function windowOptions(t: Messages): ChoiceOption<PublishedWindow>[] {
  return PUBLISHED_WINDOWS.map((value) => ({ value, label: t.filters.windows[value] }))
}

export const minScoreLabel = (t: Messages, min: number) => (min === 0 ? t.filters.anyScore : `${min}+`)

export function minScoreOptions(t: Messages): ChoiceOption<MinScore>[] {
  return MIN_SCORES.map((value) => ({ value, label: minScoreLabel(t, value) }))
}

// "All statuses", then the statuses in their pipeline optgroups (§2.4).
export function statusOptions(t: Messages): SelectItem[] {
  return [
    { value: 'ALL', label: t.filters.allStatuses },
    ...STATUS_GROUPS.map((group) => ({
      label: t.statusGroups[group.key],
      options: group.statuses.map((status) => ({ value: status, label: t.status[status] })),
    })),
  ]
}

// The boards in the loaded offers. A saved board with no offers left still shows, so the
// select never claims "All sources" while it is filtering.
export function sourceOptions(t: Messages, sources: readonly string[], current: string): SelectItem[] {
  const names = current !== 'ALL' && !sources.includes(current) ? [...sources, current] : sources
  return [{ value: 'ALL', label: t.filters.allSources }, ...names.map((name) => ({ value: name, label: name }))]
}

export function sortOptions(t: Messages): SelectItem[] {
  return SORT_KEYS.map((key) => ({ value: key, label: t.filters.sort[key] }))
}
