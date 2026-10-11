import { LANGS, type Lang } from './intl'

// Same key and rules as the inline head script in index.html, which sets <html lang>
// before first paint; keep the two in sync.
export const LANG_KEY = 'joffers-lang'

const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)

// A saved choice wins, then the first browser language we support, then English.
export function pickLang(stored: string | null, languages: readonly string[]): Lang {
  if (isLang(stored)) return stored
  for (const language of languages) {
    const prefix = String(language).slice(0, 2).toLowerCase()
    if (isLang(prefix)) return prefix
  }
  return 'en'
}

export function detectLang(): Lang {
  let stored: string | null = null
  try {
    stored = globalThis.localStorage?.getItem(LANG_KEY) ?? null
  } catch {
    // Blocked storage: fall through to the browser languages.
  }
  const nav = globalThis.navigator
  const languages = nav?.languages?.length ? nav.languages : [nav?.language ?? '']
  return pickLang(stored, languages)
}

export function saveLang(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(LANG_KEY, lang)
  } catch {
    // Not remembered, but this page still switches.
  }
}

// <html lang> follows the UI language (§5). The head script sets it before first paint;
// this keeps it right once React runs and after every switch.
export function applyLang(lang: Lang, root: { lang: string } | undefined = globalThis.document?.documentElement): void {
  if (root) root.lang = lang
}

// A choice the user made: remembered for the next visit (the head script reads it) and
// applied to <html> now. A detected language is applied but never saved, so it can follow
// the browser later.
export function chooseLang(lang: Lang, root?: { lang: string }): void {
  saveLang(lang)
  applyLang(lang, root)
}
