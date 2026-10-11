import { afterEach, describe, expect, test, vi } from 'vitest'
import indexHtml from '../../index.html?raw'
import { applyLang, chooseLang, detectLang, LANG_KEY, pickLang, saveLang } from './detect'

afterEach(() => {
  vi.unstubAllGlobals()
})

const CASES: [stored: string | null, languages: string[], expected: 'en' | 'pl'][] = [
  [null, ['pl-PL', 'en-US'], 'pl'],
  [null, ['en-GB', 'pl'], 'en'],
  [null, ['de-DE', 'pl-PL'], 'pl'],
  [null, ['de-DE', 'fr'], 'en'],
  [null, [], 'en'],
  ['pl', ['en-US'], 'pl'],
  ['en', ['pl-PL'], 'en'],
  ['de', ['pl-PL'], 'pl'],
  ['', ['PL'], 'pl'],
]

describe('pickLang', () => {
  test.each(CASES)('stored %j, browser %j → %s', (stored, languages, expected) => {
    expect(pickLang(stored, languages)).toBe(expected)
  })
})

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) }
}

describe('detectLang', () => {
  test('reads joffers-lang, then navigator.languages', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [LANG_KEY]: 'pl' }))
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
    expect(detectLang()).toBe('pl')
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('navigator', { language: 'de-DE', languages: ['de-DE', 'pl-PL'] })
    expect(detectLang()).toBe('pl')
  })

  test('falls back to navigator.language, and survives blocked storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
    })
    vi.stubGlobal('navigator', { language: 'pl-PL', languages: [] })
    expect(detectLang()).toBe('pl')
  })
})

describe('saveLang', () => {
  test('persists the choice to joffers-lang', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveLang('pl')
    expect(storage.data.get(LANG_KEY)).toBe('pl')
  })

  test('ignores storage that throws', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => saveLang('en')).not.toThrow()
  })
})

describe('applyLang and chooseLang', () => {
  test('applyLang retags <html> without remembering anything', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    const root = { lang: 'en' }
    applyLang('pl', root)
    expect(root.lang).toBe('pl')
    expect(storage.data.size).toBe(0)
  })

  test('applyLang defaults to document.documentElement', () => {
    const documentElement = { lang: 'en' }
    vi.stubGlobal('document', { documentElement })
    applyLang('pl')
    expect(documentElement.lang).toBe('pl')
  })

  test('chooseLang remembers the choice and retags <html>, so the next visit starts there', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('navigator', { language: 'en-US', languages: ['en-US'] })
    const root = { lang: 'en' }
    chooseLang('pl', root)
    expect(root.lang).toBe('pl')
    expect(storage.data.get(LANG_KEY)).toBe('pl')
    expect(detectLang()).toBe('pl')
  })
})

// index.html sets <html lang> before first paint; it must agree with detectLang().
describe('the index.html head script', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? ''

  function runHeadScript(stored: string | null, languages: string[]) {
    const root = { lang: '', setAttribute: () => {} }
    const document = { documentElement: root, querySelector: () => null, querySelectorAll: () => [] }
    const navigator = { language: languages[0] ?? '', languages }
    const localStorage = { getItem: (key: string) => (key === LANG_KEY ? stored : null) }
    new Function('document', 'navigator', 'localStorage', script)(document, navigator, localStorage)
    return root.lang
  }

  test('was found', () => {
    expect(script).toContain('joffers-lang')
  })

  test.each(CASES)('stored %j, browser %j → %s', (stored, languages, expected) => {
    expect(runHeadScript(stored, languages)).toBe(expected)
  })
})
