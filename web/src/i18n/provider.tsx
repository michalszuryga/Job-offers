import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { I18nContext } from './context'
import { applyLang, chooseLang, detectLang } from './detect'
import type { Lang } from './intl'
import { MESSAGES } from './messages'

// `lang` sets the starting language (tests, prerender); otherwise it is detected once on mount.
export function I18nProvider({ children, lang: pinned }: PropsWithChildren<{ lang?: Lang }>) {
  const [lang, setLangState] = useState<Lang>(() => pinned ?? detectLang())

  useEffect(() => applyLang(lang), [lang])

  const setLang = useCallback((next: Lang) => {
    chooseLang(next)
    setLangState(next)
  }, [])

  const value = useMemo(() => ({ lang, t: MESSAGES[lang], setLang }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
