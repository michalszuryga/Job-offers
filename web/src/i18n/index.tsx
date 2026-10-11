// The i18n entry point: components import from here, never from the parts.
// The parts keep components, hooks and plain functions in separate files for Fast
// Refresh; this barrel defines none of them, so the rule has nothing to protect here.
/* oxlint-disable react/only-export-components */
export { useI18n, type I18n } from './context'
export { applyLang, chooseLang, detectLang, LANG_KEY, pickLang, saveLang } from './detect'
export { LANGS, type Lang } from './intl'
export { MESSAGES, type Messages } from './messages'
export { I18nProvider } from './provider'
