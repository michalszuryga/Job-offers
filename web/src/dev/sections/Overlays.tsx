import {
  CircleUser,
  Download,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Search,
  Send,
  Shield,
  SlidersHorizontal,
  Sun,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import {
  Button,
  IconButton,
  Kbd,
  Menu,
  MenuGroup,
  MenuItem,
  MenuRadioItem,
  MenuSeparator,
  RadioChips,
  Select,
  Sheet,
  StatusPill,
  TextField,
  useToast,
} from '../../components/ui'
import { LANGS, useI18n } from '../../i18n'
import { isStatus } from '../../lib/status'
import type { Status } from '../../lib/types'
import { Section, Specimen } from '../KitParts'
import { LANG_NAMES, MIN_SCORE, THEMES, sortItems, statusItems, type KitTheme } from '../kitData'

const THEME_ICONS: Record<KitTheme, LucideIcon> = { auto: Monitor, light: Sun, dark: Moon }

interface Props {
  theme: KitTheme
  onTheme: (theme: KitTheme) => void
}

export function OverlaySections({ theme, onTheme }: Props) {
  const { t, lang, setLang } = useI18n()
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [sort, setSort] = useState('score')
  const [status, setStatus] = useState<Status>('INTERESTED')

  // §4.9: optimistic change, then "Status: Applied · Undo"; Undo writes the previous one back.
  const changeStatus = (next: Status) => {
    const previous = status
    setStatus(next)
    toast.show({ message: t.toast.status(t.status[next]), actionLabel: t.common.undo, onAction: () => setStatus(previous) })
  }

  const failSave = () =>
    toast.show({ message: t.toast.statusFailed, actionLabel: t.common.retry, onAction: () => changeStatus('APPLIED') })

  const resetFilters = () => {
    setQuery('')
    setMinScore(0)
    setFilterStatus('ALL')
    setSort('score')
  }

  const picked = (label: string) => () => toast.show({ message: `Picked “${label}”` })

  return (
    <Section
      id="overlays"
      title="Menu, sheet and toast"
      lede="The menu is a popover with a fallback; the sheet is a modal dialog that never touches history; one toast at a time, which waits while a sheet is open."
    >
      <Specimen label="Menu">
        <Menu
          header={
            <>
              Signed in as <strong className="kit-strong">owner@example.com</strong>
            </>
          }
          trigger={(props) => <IconButton {...props} icon={CircleUser} aria-label="Account" variant="secondary" />}
        >
          <MenuGroup label="Theme">
            {THEMES.map((option) => (
              <MenuRadioItem
                key={option.value}
                icon={THEME_ICONS[option.value]}
                checked={theme === option.value}
                onSelect={() => onTheme(option.value)}
              >
                {option.label}
              </MenuRadioItem>
            ))}
          </MenuGroup>
          <MenuGroup label="Language">
            {LANGS.map((code) => (
              <MenuRadioItem key={code} checked={lang === code} onSelect={() => setLang(code)}>
                {LANG_NAMES[code]}
              </MenuRadioItem>
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuItem icon={Keyboard} onSelect={picked('Keyboard shortcuts')}>
            <span className="kit-menu-row">
              Keyboard shortcuts <Kbd>?</Kbd>
            </span>
          </MenuItem>
          <MenuItem icon={Shield} href="#overlays">
            Privacy
          </MenuItem>
          <MenuItem icon={Download} disabled>
            Export data
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={LogOut} onSelect={picked(t.app.signOut)}>
            {t.app.signOut}
          </MenuItem>
        </Menu>
        <p className="kit-note">
          Arrow keys, Home and End move; Esc and Tab close it. The theme and language here drive the switches above.
        </p>
      </Specimen>

      <Specimen label="Sheet">
        <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setSheetOpen(true)}>
          Open filters
        </Button>
        <p className="kit-note">
          Esc, the back gesture, × and the backdrop all close it, and focus returns here.
        </p>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t.filters.label}
          footer={
            <>
              <Button variant="secondary" onClick={resetFilters}>
                Reset
              </Button>
              <Button onClick={() => setSheetOpen(false)}>Show 12 offers</Button>
            </>
          }
        >
          <div className="kit-sheet-body">
            <TextField
              label={t.filters.search}
              type="search"
              icon={Search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery('')}
              clearLabel={t.filters.clearSearch}
            />
            <RadioChips legend={t.filters.minScore} options={MIN_SCORE} value={minScore} onChange={setMinScore} />
            <Select
              label={t.filters.status}
              options={statusItems(t, true)}
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            />
            <Select
              label={t.filters.sortLabel}
              options={sortItems(t)}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            />
            <div className="kit-sheet-toast">
              <Button variant="secondary" size="sm" icon={Send} onClick={() => changeStatus('APPLIED')}>
                Queue a toast
              </Button>
              <p className="kit-note">It waits behind the sheet and shows once the sheet closes.</p>
            </div>
          </div>
        </Sheet>
      </Specimen>

      <Specimen label="Toast" layout="stack">
        <div className="kit-toast-demo__status">
          <Select
            label="Offer status"
            className="kit-status-field"
            options={statusItems(t, false)}
            value={status}
            onChange={(event) => {
              if (isStatus(event.target.value)) changeStatus(event.target.value)
            }}
          />
          <div className="kit-toast-demo__current">
            <span className="kit-note">Now</span>
            <StatusPill status={status} />
          </div>
        </div>
        <div className="kit-toast-demo__actions">
          <Button variant="secondary" icon={Send} onClick={() => changeStatus('APPLIED')}>
            Mark as applied
          </Button>
          <Button variant="secondary" icon={TriangleAlert} onClick={failSave}>
            Simulate a failed save
          </Button>
        </div>
      </Specimen>
    </Section>
  )
}
