// Locale primitives shared by the message files and lib/format.ts. No React, no copy.
export const LANGS = ['en', 'pl'] as const
export type Lang = (typeof LANGS)[number]

// Each language in its own name, as language pickers show them; not translated.
export const LANG_NAMES: Readonly<Record<Lang, string>> = { en: 'English', pl: 'Polski' }

const PLURALS: Record<Lang, Intl.PluralRules> = { en: new Intl.PluralRules('en-US'), pl: new Intl.PluralRules('pl-PL') }

export function enPlural(n: number, one: string, other: string): string {
  return PLURALS.en.select(n) === 'one' ? one : other
}

// Polish: 1 oferta, 2–4 / 22–24 oferty, 0 / 5–21 / 25… ofert.
export function plPlural(n: number, one: string, few: string, many: string): string {
  const category = PLURALS.pl.select(n)
  return category === 'one' ? one : category === 'few' ? few : many
}

const numberFormats = new Map<number, Intl.NumberFormat>()

// pl-PL grouping in both languages (plan §5), always grouped so "2 000" matches "20 000".
// The non-breaking group space keeps a number on one line. English keeps its decimal point.
export function formatNumber(value: number, lang: Lang = 'en', maximumFractionDigits = 0): string {
  let format = numberFormats.get(maximumFractionDigits)
  if (!format) {
    format = new Intl.NumberFormat('pl-PL', { useGrouping: 'always', maximumFractionDigits })
    numberFormats.set(maximumFractionDigits, format)
  }
  return format
    .formatToParts(value)
    .map((part) => (part.type === 'decimal' && lang === 'en' ? '.' : part.value))
    .join('')
}
