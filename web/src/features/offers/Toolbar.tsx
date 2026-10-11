import { SlidersHorizontal } from 'lucide-react'
import { Button, cx, IconButton, SegmentedControl } from '../../components/ui'
import { useI18n } from '../../i18n'
import { activeFilters, clearFilters, type Filters } from '../../lib/prefs'
import { windowOptions } from './filterOptions'
import { FilterPanel, type FilterChange } from './FilterPanel'
import './Toolbar.css'

interface Props {
  // ≥ 1024 px: every control inline in two rows; below, the window plus a Filters button.
  wide: boolean
  filters: Filters
  onChange: FilterChange
  sources: readonly string[]
  // Phone: opens the Filters sheet.
  onOpenFilters: () => void
}

// The sticky bar under the app bar (§4.5, §4.7). 52 px on phones, 104 px on desktop.
export function Toolbar({ wide, filters, onChange, sources, onOpenFilters }: Props) {
  const { t } = useI18n()
  const active = activeFilters(filters).length
  const published = (
    <SegmentedControl
      legend={t.filters.published}
      hideLegend
      options={windowOptions(t)}
      value={filters.window}
      onChange={(window) => onChange({ window })}
      className="toolbar__published"
    />
  )

  return (
    <div className={cx('toolbar', wide && 'toolbar--wide')}>
      {wide ? (
        <FilterPanel
          layout="bar"
          filters={filters}
          onChange={onChange}
          sources={sources}
          lead={published}
          trail={
            active > 0 && (
              <Button variant="ghost" size="sm" className="toolbar__clear" onClick={() => onChange(clearFilters(filters))}>
                {t.filters.clearAll}
              </Button>
            )
          }
        />
      ) : (
        <>
          {published}
          <IconButton
            icon={SlidersHorizontal}
            aria-label={t.filters.label}
            variant="secondary"
            badge={active}
            aria-haspopup="dialog"
            onClick={onOpenFilters}
          />
        </>
      )}
    </div>
  )
}
