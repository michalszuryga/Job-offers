import { createContext, useContext } from 'react'
import type { Lang } from './intl'
import type { Messages } from './messages'

export interface I18n {
  lang: Lang
  t: Messages
  setLang: (lang: Lang) => void
}

export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n() needs an <I18nProvider> above it')
  return value
}
