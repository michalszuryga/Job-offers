import { useEffect, useLayoutEffect, useState } from 'react'
import { Badge, Logo, SegmentedControl } from '../components/ui'
import { LANGS, useI18n } from '../i18n'
import { applyTheme, currentTheme, LANG_NAMES, THEMES, type KitTheme } from './kitData'
import { ControlSections } from './sections/Controls'
import { DisplaySections } from './sections/Display'
import { Foundations } from './sections/Foundations'
import { OverlaySections } from './sections/Overlays'
import './Kit.css'

// In page order; the ids are the sections' own.
const SECTIONS = [
  ['foundations', 'Foundations'],
  ['logo', 'Logo'],
  ['buttons', 'Buttons'],
  ['icon-buttons', 'Icon buttons'],
  ['fields', 'Text fields'],
  ['selects', 'Selects'],
  ['choices', 'Segmented and chips'],
  ['badges', 'Badges and status'],
  ['score', 'Score'],
  ['loading', 'Skeleton'],
  ['empty', 'Empty states'],
  ['callouts', 'Callouts'],
  ['keys', 'Keys and hidden text'],
  ['overlays', 'Menu, sheet, toast'],
] as const

const LANG_OPTIONS = LANGS.map((code) => ({ value: code, label: LANG_NAMES[code] }))

// The UI kit (plan P4): every components/ui component in every state, on the real tokens,
// with theme and language switches. Dev server only (main.tsx); kit.spec runs axe and the
// target-size checks against it.
export function Kit() {
  const { lang, setLang } = useI18n()
  const [theme, setTheme] = useState<KitTheme>(currentTheme)

  // Before paint, so a switch never flashes the other palette.
  useLayoutEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    document.title = 'UI kit · JOffers'
  }, [])

  return (
    <div className="kit">
      <header className="kit-bar">
        <div className="kit-bar__inner">
          <div className="kit-bar__brand">
            <Logo size={28} />
            <Badge tone="brand">Dev</Badge>
          </div>
          <div className="kit-bar__controls">
            <SegmentedControl legend="Theme" hideLegend options={THEMES} value={theme} onChange={setTheme} />
            <SegmentedControl legend="Language" hideLegend options={LANG_OPTIONS} value={lang} onChange={setLang} />
          </div>
        </div>
      </header>

      <div className="kit-layout">
        <nav className="kit-nav" aria-label="Components">
          <ul className="kit-nav__list">
            {SECTIONS.map(([id, title]) => (
              <li key={id}>
                <a className="kit-nav__link" href={`#${id}`}>
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="kit-main">
          <div className="kit-intro">
            <p className="kit-intro__eyebrow">JOffers design system</p>
            <h1 className="kit-intro__title">UI kit</h1>
            <p className="kit-intro__lede">
              Every component in <code className="kit-code">components/ui</code>, in every state, on the real tokens.
              Switch the theme and language above; <code className="kit-code">kit.spec</code> runs axe and the target-size
              checks on this page. Dev server only: it is not in the production build.
            </p>
          </div>
          <Foundations />
          <ControlSections />
          <DisplaySections />
          <OverlaySections theme={theme} onTheme={setTheme} />
        </main>
      </div>
    </div>
  )
}
