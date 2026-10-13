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

  function runHeadScript(stored: string | null, languages: string[], { session = null as string | null, hash = '' } = {}) {
    const attributes = new Map<string, string>()
    const root = { lang: '', setAttribute: (name: string, value: string) => attributes.set(name, value) }
    const document = { documentElement: root, querySelector: () => null, querySelectorAll: () => [] }
    const navigator = { language: languages[0] ?? '', languages }
    const stores: Record<string, string | null> = { [LANG_KEY]: stored, 'joffers-auth': session }
    const localStorage = { getItem: (key: string) => stores[key] ?? null }
    new Function('document', 'navigator', 'localStorage', 'location', script)(document, navigator, localStorage, { hash })
    return { lang: root.lang, boot: attributes.get('data-boot') ?? null }
  }

  test('was found', () => {
    expect(script).toContain('joffers-lang')
  })

  test.each(CASES)('stored %j, browser %j → %s', (stored, languages, expected) => {
    expect(runHeadScript(stored, languages).lang).toBe(expected)
  })

  // §4.1: members boot into the app over the prerendered landing, never seeing it flash.
  test.each([
    [{}, null],
    [{ session: '{"access_token":"x"}' }, 'app'],
    [{ hash: '#access_token=x&type=magiclink' }, 'app'],
    [{ hash: '#error=access_denied&error_code=otp_expired' }, 'app'],
    [{ hash: '#sign-in' }, null],
    [{ hash: '#offers' }, null],
  ] as const)('boot flag for %j → %s', (state, expected) => {
    expect(runHeadScript(null, ['en-US'], state).boot).toBe(expected)
  })
})
