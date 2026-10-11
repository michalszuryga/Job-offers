import { en, type Messages } from './en'
import type { Lang } from './intl'
import { pl } from './pl'

export type { Messages }

export const MESSAGES: Readonly<Record<Lang, Messages>> = { en, pl }
