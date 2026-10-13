import { en, type Messages } from './en'
import type { Lang } from './intl'

export type { Messages }

// English ships with the entry (it is also the prerendered language); Polish is its own chunk,
// so no visitor downloads both (§1 #7 budgets). main.tsx loads the detected language before
// the first render; a switch loads it, and the provider shows it once it is there.
const loaded: Partial<Record<Lang, Messages>> = { en }
const loaders: Record<Exclude<Lang, 'en'>, () => Promise<Messages>> = {
  pl: () => import('./pl').then((m) => m.pl),
}

// A language's messages, or English until they have loaded.
export function messagesFor(lang: Lang): Messages {
  return loaded[lang] ?? en
}

export function hasMessages(lang: Lang): boolean {
  return loaded[lang] != null
}

export function loadMessages(lang: Lang): Promise<Messages> {
  const ready = loaded[lang]
  if (ready) return Promise.resolve(ready)
  return loaders[lang as Exclude<Lang, 'en'>]().then((messages) => (loaded[lang] = messages))
}

// For code that has the messages already (unit tests, which render Polish synchronously).
export function registerMessages(lang: Lang, messages: Messages): void {
  loaded[lang] = messages
}
