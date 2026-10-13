import type { ReactElement, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { jsx, jsxs } from 'react/jsx-runtime'
import { Search } from 'lucide-react'
import { describe, expect, test } from 'vitest'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Kbd } from './Kbd'
import { Logo } from './Logo'
import { RadioChips } from './RadioChips'
import { SegmentedControl } from './SegmentedControl'
import { Select } from './Select'
import { TextField } from './TextField'
import { VisuallyHidden } from './VisuallyHidden'

// Control components of the kit, rendered to markup: names, ARIA wiring and the native
// elements the e2e specs rely on. Looks and target sizes are kit.spec's job (axe + boxes).

// What <Type {...props} /> compiles to, typed; this file can't hold JSX (vitest runs *.test.ts).
const el = <P extends object>(type: (props: P) => ReactNode, props: P): ReactElement => jsx(type, props)
const render = (element: ReactElement) => renderToStaticMarkup(element)
const noop = () => {}

// The opening tag of the first element carrying `className`, so checks don't depend on attribute order.
const tagWith = (html: string, className: string) => html.match(new RegExp(`<[^>]*\\b${className}\\b[^>]*>`))?.[0] ?? ''
const radios = (html: string) => [...html.matchAll(/<input type="radio"[^>]*>/g)].map((match) => match[0])

describe('Logo', () => {
  test('the mark is flat: no gradient, so no ids to collide between instances', () => {
    const html = render(jsxs('div', { children: [el(Logo, {}), el(Logo, { showWordmark: false })] }))
    expect(html).not.toMatch(/Gradient|url\(#| id="/)
  })

  test('the wordmark names it, so the mark is silent', () => {
    const html = render(el(Logo, {}))
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(html).not.toContain('role="img"')
    expect(html).toContain('<span class="ui-logo__word" translate="no">JOffers</span>')
  })

  test('alone, the mark is an image named JOffers', () => {
    expect(render(el(Logo, { showWordmark: false }))).toMatch(/<svg[^>]*role="img" aria-label="JOffers"/)
  })

  test('decorative hides the whole logo', () => {
    const html = render(el(Logo, { decorative: true }))
    expect(html).toMatch(/^<span class="ui-logo" [^>]*aria-hidden="true">/)
    expect(html).not.toContain('role="img"')
  })

  test('geometry and colours follow §2.1 and the --mark tokens', () => {
    const html = render(el(Logo, { size: 24 }))
    expect(html).toContain('rx="9"')
    expect(html).toContain('stroke-dasharray="50.3 12.6"')
    expect(html).toContain('transform="rotate(-90 16 16)"')
    expect(html).toContain('d="M18.5 10.5v6.5a3.5 3.5 0 0 1-7 0"')
    expect(html).toContain('fill:var(--mark-bg)')
    expect(html).not.toContain('Gradient')
    expect(html).toContain('--logo-size:24px')
  })
})

describe('Button', () => {
  test('is a plain button by default, so it never submits by accident', () => {
    expect(render(el(Button, { children: 'Save' }))).toBe(
      '<button type="button" class="ui-button ui-button--primary ui-button--md"><span class="ui-button__label">Save</span></button>',
    )
    expect(render(el(Button, { type: 'submit', children: 'Send' }))).toContain('type="submit"')
  })

  test('an href makes it a link with the same classes', () => {
    const html = render(el(Button, { href: '/demo', variant: 'secondary', size: 'sm', children: 'Try the demo' }))
    expect(html).toMatch(/^<a href="\/demo" class="ui-button ui-button--secondary ui-button--sm">/)
    expect(html).not.toContain('type=')
  })

  test('loading keeps the label (and its name) and says busy without disabling', () => {
    const html = render(el(Button, { loading: true, children: 'Send sign-in link' }))
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toMatch(/ disabled=""/)
    expect(html).toContain('>Send sign-in link</span>')
    expect(html).toContain('ui-button__spinner')
  })

  test('icons are hidden from assistive tech', () => {
    const html = render(el(Button, { icon: Search, fullWidth: true, children: 'Search' }))
    expect(html).toContain('ui-button--full')
    expect(tagWith(html, 'ui-button__icon')).toContain('aria-hidden="true"')
  })
})

describe('IconButton', () => {
  test('the badge count joins the accessible name', () => {
    const html = render(el(IconButton, { icon: Search, 'aria-label': 'Filters', badge: 2 }))
    expect(html).toContain('aria-label="Filters (2)"')
    expect(html).toContain('<span class="ui-icon-button__badge" aria-hidden="true">2</span>')
  })

  test('no count, no badge', () => {
    const html = render(el(IconButton, { icon: Search, 'aria-label': 'Filters', badge: 0 }))
    expect(html).toContain('aria-label="Filters"')
    expect(html).not.toContain('ui-icon-button__badge')
  })

  test('large counts are capped on screen, exact in the name', () => {
    const html = render(el(IconButton, { icon: Search, 'aria-label': 'Filters', badge: 120 }))
    expect(html).toContain('aria-label="Filters (120)"')
    expect(html).toContain('>99+</span>')
  })
})

describe('TextField', () => {
  test('label, error and hint are wired to the input', () => {
    const html = render(el(TextField, { id: 'email', label: 'Email', type: 'email', hint: 'No password.', error: 'Enter a valid email.' }))
    expect(html).toContain('<label class="ui-field__label" for="email">Email</label>')
    expect(html).toMatch(/<input[^>]*id="email"[^>]*aria-describedby="email-error email-hint"[^>]*aria-invalid="true"/)
    expect(html).toContain('<p id="email-hint" class="ui-field__hint">No password.</p>')
    expect(html).toContain('<p id="email-error" class="ui-field__error"><svg')
    expect(tagWith(html, 'ui-field__error-icon')).toContain('aria-hidden="true"')
  })

  test('a clean field has no describedby or invalid state', () => {
    const html = render(el(TextField, { label: 'Name' }))
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('aria-invalid')
    expect(html).toContain('type="text"')
  })

  test('a caller describedby is kept after the field own ids', () => {
    const html = render(el(TextField, { id: 'q', label: 'Code', hint: '6 digits', 'aria-describedby': 'resend', inputMode: 'numeric' }))
    expect(html).toContain('aria-describedby="q-hint resend"')
    expect(html).toContain('inputMode="numeric"')
  })

  test('search shows its clear button only with something to clear', () => {
    const props = { label: 'Search title or company', type: 'search' as const, icon: Search, onClear: noop, clearLabel: 'Clear search', onChange: noop }
    const filled = render(el(TextField, { ...props, value: 'qa' }))
    expect(filled).toContain('aria-label="Clear search"')
    expect(filled).toContain('ui-text-field--clearable')
    const empty = render(el(TextField, { ...props, value: '' }))
    expect(empty).not.toContain('Clear search')
    // The room stays reserved, so typing the first letter doesn't reflow the text.
    expect(empty).toContain('ui-text-field--clearable')
  })

  test('the label can be visually hidden but stays a label', () => {
    expect(render(el(TextField, { label: 'Search', hideLabel: true }))).toMatch(/<label class="ui-field__label visually-hidden" for=/)
  })
})

describe('Select', () => {
  test('groups in the options model become optgroups', () => {
    const html = render(
      el(Select, {
        label: 'Status',
        defaultValue: 'ALL',
        options: [
          { value: 'ALL', label: 'All statuses' },
          { label: 'Triage', options: [{ value: 'TO_REVIEW', label: 'To review' }, { value: 'REVIEW', label: 'Reviewed' }] },
        ],
      }),
    )
    expect(html).toContain('<option value="ALL" selected="">All statuses</option>')
    expect(html).toContain('<optgroup label="Triage"><option value="TO_REVIEW">To review</option><option value="REVIEW">Reviewed</option></optgroup>')
    expect(html).toContain('</select><svg')
    expect(tagWith(html, 'ui-select__chevron')).toContain('aria-hidden="true"')
  })

  test('children work too, and the label points at the select', () => {
    const html = render(el(Select, { id: 'sort', label: 'Sort', children: jsx('option', { value: 'score', children: 'Best match' }) }))
    expect(html).toContain('<label class="ui-field__label" for="sort">Sort</label>')
    expect(html).toMatch(/<select id="sort" class="ui-field__input ui-select__input"><option value="score">Best match<\/option><\/select>/)
  })
})

describe('SegmentedControl and RadioChips', () => {
  const windows = [
    { value: 'new', label: 'New' },
    { value: '24h', label: '24 h' },
    { value: '3d', label: '3 days' },
    { value: '7d', label: '7 days' },
    { value: 'any', label: 'Any time' },
  ] as const

  test('segments are native radios in a fieldset, one name, one checked', () => {
    const html = render(el(SegmentedControl, { legend: 'Published', hideLegend: true, options: windows, value: '24h', onChange: noop }))
    expect(html).toMatch(/^<fieldset class="ui-segmented"><legend class="ui-segmented__legend visually-hidden">Published<\/legend>/)
    const inputs = radios(html)
    expect(inputs).toHaveLength(5)
    expect(new Set(inputs.map((radio) => radio.match(/name="([^"]+)"/)?.[1])).size).toBe(1)
    expect(inputs.filter((radio) => radio.includes('checked=""'))).toEqual([expect.stringContaining('value="24h"')])
    expect(html).toContain('<span class="ui-segmented__label">Any time</span>')
  })

  test('chips take numbers and mark every option with a hidden check', () => {
    const presets = [
      { value: 0, label: 'Any score' },
      { value: 50, label: '50+' },
      { value: 65, label: '65+' },
      { value: 80, label: '80+' },
    ]
    const html = render(el(RadioChips, { legend: 'Min score', options: presets, value: 65, onChange: noop, name: 'min-score' }))
    expect(html).toContain('<legend class="ui-chips__legend">Min score</legend>')
    const inputs = radios(html)
    expect(inputs.filter((radio) => radio.includes('checked=""'))).toEqual([expect.stringContaining('value="65"')])
    expect(inputs.filter((radio) => radio.includes('name="min-score"'))).toHaveLength(4)
    const checks = html.match(/<svg[^>]*\bui-chips__check\b[^>]*>/g) ?? []
    expect(checks).toHaveLength(4)
    for (const check of checks) expect(check).toContain('aria-hidden="true"')
  })

  test('disabled reaches every radio through the fieldset', () => {
    expect(render(el(RadioChips, { legend: 'Min score', options: [{ value: 0, label: 'Any' }], value: 0, onChange: noop, disabled: true }))).toMatch(
      /^<fieldset class="ui-chips" disabled="">/,
    )
  })
})

describe('Kbd and VisuallyHidden', () => {
  test('render their native element with the kit class', () => {
    expect(render(el(Kbd, { children: 'Esc' }))).toBe('<kbd class="ui-kbd">Esc</kbd>')
    expect(render(el(VisuallyHidden, { children: 'Match 75 of 100' }))).toBe('<span class="visually-hidden">Match 75 of 100</span>')
  })
})
