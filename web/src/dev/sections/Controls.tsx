import { ArrowRight, Bell, ExternalLink, LogOut, Play, RefreshCw, Save, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton, RadioChips, SegmentedControl, Select, TextField } from '../../components/ui'
import { useI18n } from '../../i18n'
import { Example, Section, Specimen } from '../KitParts'
import { MIN_SCORE, PUBLISHED, sortItems, sourceItems, statusItems } from '../kitData'

export function ControlSections() {
  const { t } = useI18n()
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('Playwright')
  const [status, setStatus] = useState('ALL')
  const [sort, setSort] = useState('score')
  const [published, setPublished] = useState('new')
  const [minScore, setMinScore] = useState(0)

  // The "click to load" button settles by itself, like a save that succeeds.
  useEffect(() => {
    if (!saving) return
    const timer = setTimeout(() => setSaving(false), 1500)
    return () => clearTimeout(timer)
  }, [saving])

  return (
    <>
      <Section
        id="buttons"
        title="Buttons"
        lede="Primary for the one main action of a view, secondary beside it, ghost for quiet actions, danger (outlined) for sign-out and anything destructive."
      >
        <Specimen label="Variants">
          <Button trailingIcon={ExternalLink}>Open offer</Button>
          <Button variant="secondary" icon={Play}>
            Try the demo
          </Button>
          <Button variant="ghost">Clear all</Button>
          <Button variant="danger" icon={LogOut}>
            Sign out
          </Button>
        </Specimen>
        <Specimen label="Small">
          <Button size="sm" trailingIcon={ExternalLink}>
            Open offer
          </Button>
          <Button size="sm" variant="secondary" icon={RefreshCw}>
            {t.common.tryAgain}
          </Button>
          <Button size="sm" variant="ghost">
            Clear all
          </Button>
          <Button size="sm" variant="danger">
            Remove
          </Button>
        </Specimen>
        <Specimen label="States">
          <Example caption="Loading">
            <Button loading>{t.details.save}</Button>
          </Example>
          <Example caption="Click: loads for 1.5 s">
            <Button variant="secondary" icon={Save} loading={saving} onClick={() => setSaving(true)}>
              {t.details.save}
            </Button>
          </Example>
          <Example caption="Disabled">
            <Button disabled>{t.details.save}</Button>
          </Example>
          <Example caption="Link (href)">
            <Button variant="secondary" href="#buttons" trailingIcon={ArrowRight}>
              Back to buttons
            </Button>
          </Example>
        </Specimen>
        <Specimen label="Full width" layout="stack" className="kit-narrow">
          <Button fullWidth>Show 12 offers</Button>
        </Specimen>
      </Section>

      <Section
        id="icon-buttons"
        title="Icon buttons"
        lede="Icon-only, so the label is required. A badge count is drawn on the corner and added to the name: “Filters (2)”."
      >
        <Specimen label="Variants and states">
          <Example caption="Ghost">
            <IconButton icon={RefreshCw} aria-label="Refresh" />
          </Example>
          <Example caption="Secondary · badge">
            <IconButton icon={SlidersHorizontal} aria-label={t.filters.label} variant="secondary" badge={2} />
          </Example>
          <Example caption="Badge over 99">
            <IconButton icon={Bell} aria-label="Notifications" badge={120} />
          </Example>
          <Example caption="Small">
            <IconButton icon={X} aria-label={t.common.close} size="sm" />
          </Example>
          <Example caption="Disabled">
            <IconButton icon={RefreshCw} aria-label="Refresh offers" disabled />
          </Example>
        </Specimen>
      </Section>

      <Section
        id="fields"
        title="Text fields"
        lede="A visible label, 16 px text so iOS never zooms, and hint and error tied to the input. The error has an icon, so colour is never the only cue."
      >
        <Specimen label="Label, hint, error, search, disabled" layout="grid">
          <TextField
            label={t.login.email}
            type="email"
            placeholder="you@example.com"
            autoComplete="off"
            hint="No password. We'll email you a one-time link."
          />
          <TextField label={t.details.rate} defaultValue="a lot" error="Enter a rate, e.g. 120 PLN/h B2B." />
          <TextField
            label={t.filters.search}
            type="search"
            icon={Search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            clearLabel={t.filters.clearSearch}
            hint="Esc or × clears it."
          />
          <TextField label={t.details.notice} defaultValue="1 month" disabled />
        </Specimen>
      </Section>

      <Section
        id="selects"
        title="Selects"
        lede="The native select: the platform picker is the best one on phones. Statuses come in their pipeline groups."
      >
        <Specimen label="Optgroups, hint, disabled" layout="grid">
          <Select
            label={t.filters.status}
            options={statusItems(t, true)}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          />
          <Select
            label={t.filters.sortLabel}
            options={sortItems(t)}
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          />
          <Select label={t.filters.source} options={sourceItems(t)} defaultValue="ALL" hint="3 boards in the last fetch." />
          <Select label="Currency" options={[{ value: 'PLN', label: 'PLN' }]} disabled />
        </Specimen>
      </Section>

      <Section
        id="choices"
        title="Segmented control and chips"
        lede="Native radios under the hood, so arrow keys and forms just work. The selected chip adds a tick; the selected segment is raised with an edge."
      >
        <Specimen label="Segmented · Published">
          <SegmentedControl legend={t.filters.published} options={PUBLISHED} value={published} onChange={setPublished} />
        </Specimen>
        <Specimen label="Radio chips · Min score">
          <RadioChips legend={t.filters.minScore} options={MIN_SCORE} value={minScore} onChange={setMinScore} />
        </Specimen>
      </Section>
    </>
  )
}
