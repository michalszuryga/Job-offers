import { describe, expect, test } from 'vitest'
// Vitest blanks CSS imports unless vite.config.ts has test.css.include matching /\.css\?raw$/.
import tokensCss from './tokens.css?raw'

// WCAG 2.2 contrast for every fg/bg token pair the UI uses (plan §2.2, §5).
// Text needs 4.5:1 (1.4.3); control borders, focus rings and other UI needs 3:1 (1.4.11).
const TEXT = 4.5
const UI = 3

type Scheme = 'light' | 'dark'

// Each token is either light-dark(#light,#dark) or an alias var(--other).
function parseTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>()
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, name, value] of withoutComments.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(name, value.trim())
  }
  return tokens
}

const TOKENS = parseTokens(tokensCss)

function resolve(name: string, scheme: Scheme, seen: string[] = []): string {
  const value = TOKENS.get(name)
  if (value == null) throw new Error(`--${name} is not defined in tokens.css`)
  if (seen.includes(name)) throw new Error(`alias cycle: ${[...seen, name].join(' → ')}`)
  const alias = value.match(/^var\(--([\w-]+)\)$/)
  if (alias) return resolve(alias[1], scheme, [...seen, name])
  const pair = value.match(/^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i)
  if (!pair) throw new Error(`--${name} is not an opaque light-dark(#rrggbb,#rrggbb) colour: ${value}`)
  return scheme === 'light' ? pair[1] : pair[2]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [foreground tokens, background tokens, minimum ratio, what uses it]
const PAIRS: [string[], string[], number, string][] = [
  // Text
  [['fg'], ['canvas', 'surface', 'surface-2', 'surface-raised', 'brand-tint', 'success-tint', 'info-tint', 'warning-tint', 'danger-tint'], TEXT, 'body text, score number on band tints'],
  [['fg-muted'], ['canvas', 'surface', 'surface-2', 'surface-raised', 'brand-tint'], TEXT, 'secondary text, incl. meta on the selected card'],
  [['brand'], ['canvas', 'surface', 'surface-2', 'surface-raised'], TEXT, 'links and link buttons'],
  [['brand-ink'], ['brand-tint', 'surface', 'canvas'], TEXT, 'text on brand tint'],
  [['on-brand'], ['brand', 'brand-hover'], TEXT, 'primary buttons, NEW badge'],
  [['success', 'info', 'warning', 'danger'], ['surface', 'surface-raised'], TEXT, 'status text'],
  [['warning', 'danger'], ['canvas'], TEXT, 'fetch warning, page-level errors'],
  [['success', 'danger'], ['surface-2'], TEXT, 'save feedback in panels'],
  // UI components and graphics
  [['line-strong'], ['canvas', 'surface', 'surface-2', 'surface-raised'], UI, 'control borders, unscored ring'],
  [['focus'], ['canvas', 'surface', 'surface-2', 'surface-raised', 'brand-tint'], UI, 'focus ring'],
  [['brand'], ['surface', 'brand-tint'], UI, 'NEW badge, selected card ring'],
  [['fg-muted'], ['surface-2'], UI, 'low band ring'],
]

const TONES = ['success', 'info', 'warning', 'danger']
const TONE_PAIRS: [string[], string[], number, string][] = [
  ...TONES.map((tone): [string[], string[], number, string] => [[tone], [`${tone}-tint`], TEXT, 'tone on its tint']),
  ...['success', 'info', 'warning'].map((band): [string[], string[], number, string] => [
    [band], [`${band}-tint`, 'surface'], UI, 'score band ring',
  ]),
]

const cases = [...PAIRS, ...TONE_PAIRS].flatMap(([fgs, bgs, min, use]) =>
  fgs.flatMap((fg) =>
    bgs.flatMap((bg) =>
      (['light', 'dark'] as const).map((scheme) => ({
        name: `${fg} on ${bg} [${scheme}]`,
        fg,
        bg,
        scheme,
        min,
        use,
      })),
    ),
  ),
)

describe('token contrast', () => {
  test('tokens.css is readable', () => {
    expect(TOKENS.size, 'empty ?raw import: add test.css.include [/\\.css\\?raw$/] to vite.config.ts').toBeGreaterThan(0)
  })

  test.each(cases)('$name ≥ $min ($use)', ({ fg, bg, scheme, min }) => {
    const [fgHex, bgHex] = [resolve(fg, scheme), resolve(bg, scheme)]
    const ratio = Math.round(contrast(fgHex, bgHex) * 100) / 100
    expect(ratio, `${fg} ${fgHex} on ${bg} ${bgHex}`).toBeGreaterThanOrEqual(min)
  })
})

// "tokens.css is the only file with colour literals" (plan §2.2): everything else must
// go through var(--…), so both themes and the contrast checks above stay in one place.
const SOURCES = import.meta.glob<string>(
  ['/src/**/*.{css,ts,tsx}', '!/src/styles/tokens.css', '!/src/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
)
// A hex colour not part of an HTML entity (&#8211;), or a colour function.
const COLOUR_LITERAL = /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi

describe('colour literals live only in tokens.css', () => {
  test('the glob found the sources', () => {
    expect(Object.keys(SOURCES)).toContain('/src/main.tsx')
  })

  test.each(Object.entries(SOURCES).map(([file, text]) => ({ file, text })))('$file', ({ text }) => {
    expect(text.length, 'file read as empty').toBeGreaterThan(0)
    expect(text.match(COLOUR_LITERAL) ?? []).toEqual([])
  })
})
