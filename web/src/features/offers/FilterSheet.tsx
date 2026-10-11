import { Button, Sheet } from '../../components/ui'
import { useI18n } from '../../i18n'
import { clearFilters, DEFAULT_FILTERS, type Filters } from '../../lib/prefs'
import { FilterPanel, type FilterChange } from './FilterPanel'

interface Props {
  open: boolean
  onClose: () => void
  filters: Filters
  onChange: FilterChange
  sources: readonly string[]
  // Offers the current filters show, for "Show N offers".
  count: number
}

// Phone (§4.6): FilterPanel in a bottom sheet. Filters apply as they change, so the list
// behind is always current; [Show N offers] just closes. Loaded on first open (OffersPage).
export function FilterSheet({ open, onClose, filters, onChange, sources, count }: Props) {
  const { t } = useI18n()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.filters.label}
      footer={
        <>
          {/* Everything in the sheet back to its default; the window is in the toolbar. */}
          <Button variant="secondary" onClick={() => onChange({ ...clearFilters(filters), sort: DEFAULT_FILTERS.sort })}>
            {t.filters.reset}
          </Button>
          <Button onClick={onClose}>{t.filters.show(count)}</Button>
        </>
      }
    >
      <FilterPanel layout="sheet" filters={filters} onChange={onChange} sources={sources} />
    </Sheet>
  )
}
