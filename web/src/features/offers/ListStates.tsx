import { Inbox, RotateCw, SearchX } from 'lucide-react'
import { Button, Callout, EmptyState } from '../../components/ui'
import { useI18n } from '../../i18n'
import { nextFetchToday } from '../../lib/batch'
import { activeFilters, clearFilters, type Filters } from '../../lib/prefs'
import type { FilterChange } from './FilterPanel'
import './ListStates.css'

interface EmptyProps {
  filters: Filters
  // Size of the New set: an empty New view says so, whatever else is set.
  batchSize: number
  onChange: FilterChange
}

// Nothing to list (§4.10), with one way out each: an empty New view points at the next fetch
// and the last 3 days; otherwise clear the filters, or widen the window when only it is left.
export function EmptyList({ filters, batchSize, onChange }: EmptyProps) {
  const { t } = useI18n()
  if (filters.window === 'new' && batchSize === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t.offers.emptyNew}
        actions={
          <Button variant="secondary" onClick={() => onChange({ window: '3d' })}>
            {t.offers.showRecent}
          </Button>
        }
      >
        {t.offers.nextFetch(nextFetchToday())}
      </EmptyState>
    )
  }
  const filtered = activeFilters(filters).length > 0
  return (
    <EmptyState
      icon={SearchX}
      title={t.offers.empty}
      actions={
        <Button variant="secondary" onClick={() => onChange(filtered ? clearFilters(filters) : { window: 'any' })}>
          {filtered ? t.offers.clearFilters : t.offers.showAll}
        </Button>
      }
    />
  )
}

interface ErrorProps {
  // The raw Supabase text, for "Technical details" only.
  detail: string
  onRetry: () => void
}

// "Couldn't load offers" (§4.10): friendly words, Try again, the raw error folded away. Also
// above a list whose refresh failed, which keeps the offers it had.
export function LoadError({ detail, onRetry }: ErrorProps) {
  const { t } = useI18n()
  return (
    <Callout
      tone="danger"
      className="list-error"
      title={<span role="alert">{t.offers.loadError}</span>}
      actions={
        <Button variant="secondary" size="sm" icon={RotateCw} onClick={onRetry}>
          {t.common.tryAgain}
        </Button>
      }
      details={detail}
    />
  )
}
