import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import { RadioChips, Select, TextField } from '../../components/ui'
import { useI18n } from '../../i18n'
import type { Filters, SortKey } from '../../lib/prefs'
import { isStatus } from '../../lib/status'
import { minScoreOptions, sortOptions, sourceOptions, statusOptions } from './filterOptions'
import './FilterPanel.css'

export type FilterChange = (patch: Partial<Filters>) => void

interface Props {
  filters: Filters
  onChange: FilterChange
  // Board names in the loaded offers.
  sources: readonly string[]
  // 'sheet': stacked with visible labels (phone, §4.6). 'bar': the desktop toolbar's two
  // rows (§4.7), labels kept for screen readers only.
  layout: 'sheet' | 'bar'
  // Bar only: what leads row 1 (the Published control) and ends row 2 (Clear all).
  lead?: ReactNode
  trail?: ReactNode
}

// The one set of filter controls (§4.6). Every change applies at once; the sheet's
// "Show N offers" only closes it.
export function FilterPanel({ filters, onChange, sources, layout, lead, trail }: Props) {
  const { t } = useI18n()
  const bar = layout === 'bar'

  const search = (
    <TextField
      label={t.filters.search}
      hideLabel={bar}
      placeholder={bar ? t.filters.search : undefined}
      type="search"
      icon={Search}
      value={filters.query}
      onChange={(event) => onChange({ query: event.target.value })}
      onClear={() => onChange({ query: '' })}
      clearLabel={t.filters.clearSearch}
      className="filter-panel__search"
    />
  )
  const minScore = (
    <RadioChips
      legend={t.filters.minScore}
      hideLegend={bar}
      options={minScoreOptions(t)}
      value={filters.minScore}
      onChange={(minScore) => onChange({ minScore })}
      className="filter-panel__score"
    />
  )
  const status = (
    <Select
      label={t.filters.status}
      hideLabel={bar}
      options={statusOptions(t)}
      value={filters.status}
      onChange={(event) => {
        const value = event.target.value
        onChange({ status: isStatus(value) ? value : 'ALL' })
      }}
      className="filter-panel__select"
    />
  )
  const source = (
    <Select
      label={t.filters.source}
      hideLabel={bar}
      options={sourceOptions(t, sources, filters.source)}
      value={filters.source}
      onChange={(event) => onChange({ source: event.target.value })}
      className="filter-panel__select"
    />
  )
  const sort = (
    <Select
      label={t.filters.sortLabel}
      hideLabel={bar}
      options={sortOptions(t)}
      value={filters.sort}
      onChange={(event) => onChange({ sort: event.target.value as SortKey })}
      className="filter-panel__select"
    />
  )

  if (bar) {
    return (
      <>
        <div className="filter-bar__row">
          {lead}
          {search}
          {sort}
        </div>
        <div className="filter-bar__row">
          {minScore}
          {status}
          {source}
          {trail}
        </div>
      </>
    )
  }
  return (
    <div className="filter-panel">
      {search}
      {minScore}
      {status}
      {source}
      {sort}
    </div>
  )
}
