import type { CSSProperties } from 'react'
import { Logo } from '../../components/ui'
import { Example, Section, Specimen } from '../KitParts'

// Tokens are drawn through var(), so every swatch follows the theme switch.
const COLOURS = [
  { label: 'Surfaces and lines', tokens: ['canvas', 'surface', 'surface-2', 'surface-raised', 'line', 'line-strong'] },
  { label: 'Text and brand', tokens: ['fg', 'fg-muted', 'brand', 'brand-hover', 'brand-tint', 'brand-ink'] },
  {
    label: 'Tones',
    tokens: ['success', 'success-tint', 'info', 'info-tint', 'warning', 'warning-tint', 'danger', 'danger-tint'],
  },
]

// §2.5, each with a line it is actually used for.
const TYPE = [
  { token: 'display', sample: 'QA jobs, scored for you.' },
  { token: 'h1', sample: 'Offers' },
  { token: 'h2', sample: 'Senior QA Engineer' },
  { token: 'h3', sample: 'Why 75?' },
  { token: 'h4', sample: 'Requirements' },
  { token: 'title', sample: 'QA Automation Engineer' },
  { token: 'body-lg', sample: 'Every evening at 18:00 JOffers checks the boards and scores each offer.' },
  { token: 'body', sample: '2 new · fetched 2 h ago' },
  { token: 'sm', sample: 'Acme · Remote · B2B · Board A' },
  { token: 'xs', sample: 'Private beta' },
  { token: 'num-lg', sample: '75' },
]

const RADII = ['sm', 'md', 'lg', 'xl', 'full']
const SHADOWS = ['card', 'md', 'lg']

const typeStyle = (token: string): CSSProperties => ({
  fontSize: `var(--fs-${token})`,
  lineHeight: `var(--lh-${token})`,
  fontWeight: `var(--fw-${token})`,
  letterSpacing: `var(--ls-${token}, normal)`,
})

export function Foundations() {
  return (
    <>
      <Section id="foundations" title="Foundations" lede="The tokens every component reads (styles/tokens.css). Switch the theme above to check both palettes.">
        {COLOURS.map(({ label, tokens }) => (
          <Specimen key={label} label={label} layout="grid" className="kit-swatches">
            {tokens.map((token) => (
              <div key={token} className="kit-swatch">
                <span className="kit-swatch__chip" style={{ background: `var(--${token})` }} />
                <code className="kit-code">--{token}</code>
              </div>
            ))}
          </Specimen>
        ))}
        <Specimen label="Type scale" layout="stack">
          {TYPE.map(({ token, sample }) => (
            <div key={token} className="kit-type">
              <code className="kit-code kit-type__token">{token}</code>
              <p className="kit-type__sample" style={typeStyle(token)}>
                {sample}
              </p>
            </div>
          ))}
        </Specimen>
        <Specimen label="Radius and elevation">
          {RADII.map((radius) => (
            <Example key={radius} caption={`radius-${radius}`}>
              <span className="kit-box" style={{ borderRadius: `var(--radius-${radius})` }} />
            </Example>
          ))}
          {SHADOWS.map((shadow) => (
            <Example key={shadow} caption={`shadow-${shadow}`}>
              <span className="kit-box kit-box--raised" style={{ boxShadow: `var(--shadow-${shadow})` }} />
            </Example>
          ))}
        </Specimen>
      </Section>

      <Section id="logo" title="Logo" lede="The mark echoes the score ring. With the wordmark the text names it; the mark alone is an image named JOffers.">
        <Specimen label="With wordmark">
          <Example caption="24 px">
            <Logo size={24} />
          </Example>
          <Example caption="32 px">
            <Logo />
          </Example>
          <Example caption="48 px">
            <Logo size={48} />
          </Example>
        </Specimen>
        <Specimen label="Mark only">
          <Example caption="32 px">
            <Logo showWordmark={false} />
          </Example>
          <Example caption="48 px">
            <Logo size={48} showWordmark={false} />
          </Example>
          <Example caption="64 px · decorative">
            <Logo size={64} showWordmark={false} decorative />
          </Example>
        </Specimen>
      </Section>
    </>
  )
}
