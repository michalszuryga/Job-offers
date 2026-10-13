import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { I18nContext } from './context'
import { applyLang, chooseLang, detectLang } from './detect'
import type { Lang } from './intl'
import { hasMessages, loadMessages, messagesFor } from './messages'

// `lang` sets the starting language (tests, prerender); otherwise it is detected once on mount.
// A language whose messages are still loading shows English until they arrive (a few ms after
// a switch; main.tsx loads the detected one before the first render).
export function I18nProvider({ children, lang: pinned }: PropsWithChildren<{ lang?: Lang }>) {
  const [lang, setLangState] = useState<Lang>(() => pinned ?? detectLang())
  const ready = hasMessages(lang)
  const [, setArrived] = useState(0)

  useEffect(() => applyLang(lang), [lang])

  useEffect(() => {
    if (ready) return
    let current = true
    loadMessages(lang).then(
      () => current && setArrived((n) => n + 1),
      // Offline or a removed chunk: English stays.
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [lang, ready])

  const setLang = useCallback((next: Lang) => {
    chooseLang(next)
    setLangState(next)
  }, [])

  const t = ready ? messagesFor(lang) : messagesFor('en')
  const value = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
