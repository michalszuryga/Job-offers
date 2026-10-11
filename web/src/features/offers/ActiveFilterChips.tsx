import { X } from 'lucide-react'
import { Button, Icon } from '../../components/ui'
import { useI18n, type Messages } from '../../i18n'
import { activeFilters, clearFilters, DEFAULT_FILTERS, type FilterField, type Filters } from '../../lib/prefs'
import type { FilterChange } from './FilterPanel'
import './ActiveFilterChips.css'

function chipLabel(field: FilterField, filters: Filters, t: Messages): string {
  switch (field) {
    case 'minScore': return t.filters.scoreChip(filters.minScore)
    case 'status': return filters.status === 'ALL' ? '' : t.status[filters.status]
    case 'source': return filters.source
    case 'query': return t.filters.queryChip(filters.query.trim())
  }
}

interface Props {
  filters: Filters
  onChange: FilterChange
}

// Phone (§4.5): what the Filters sheet is hiding, one chip each, each removing its own
// filter, then "Clear all". Nothing at all when no filter is on.
export function ActiveFilterChips({ filters, onChange }: Props) {
  const { t } = useI18n()
  const fields = activeFilters(filters)
  if (fields.length === 0) return null

  return (
    <div className="filter-chips offers-band" role="group" aria-label={t.filters.active}>
      <ul className="filter-chips__list">
        {fields.map((field) => {
          const label = chipLabel(field, filters, t)
          return (
            <li key={field}>
              <button
                type="button"
                className="filter-chips__chip"
                aria-label={t.filters.remove(label)}
                onClick={() => onChange({ [field]: DEFAULT_FILTERS[field] })}
              >
                <span className="filter-chips__label">{label}</span>
                <Icon icon={X} className="filter-chips__x" />
              </button>
            </li>
          )
        })}
      </ul>
      <Button variant="ghost" size="sm" className="filter-chips__clear" onClick={() => onChange(clearFilters(filters))}>
        {t.filters.clearAll}
      </Button>
    </div>
  )
}
