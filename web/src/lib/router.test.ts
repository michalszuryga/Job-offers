import { afterEach, describe, expect, test, vi } from 'vitest'
import { closeOffer, isPushedOffer, offerIdFrom, withOffer } from './router'

const APP = 'https://example.test/Job-offers/'

describe('offerIdFrom', () => {
  test('reads ?offer= and treats a missing or empty one as closed', () => {
    expect(offerIdFrom('?offer=abc')).toBe('abc')
    expect(offerIdFrom('offer=abc&view=new')).toBe('abc')
    expect(offerIdFrom('')).toBeNull()
    expect(offerIdFrom('?offer=')).toBeNull()
    expect(offerIdFrom('?view=new')).toBeNull()
  })
})

describe('withOffer', () => {
  test('sets the param on the current path and drops the fragment', () => {
    expect(withOffer(`${APP}#offers`, 'abc')).toBe('/Job-offers/?offer=abc')
  })

  test('replaces an open offer and keeps other params', () => {
    expect(withOffer(`${APP}?view=new&offer=a`, 'b')).toBe('/Job-offers/?view=new&offer=b')
  })

  test('removing it leaves a clean path', () => {
    expect(withOffer(`${APP}?offer=a`, null)).toBe('/Job-offers/')
    expect(withOffer(`${APP}?offer=a&view=new`, null)).toBe('/Job-offers/?view=new')
  })

  test.each([
    'https://board.test/acme',
    'https://board.test/oferta?id=7&ref=list',
    'https://board.test/łódź/tester%20QA',
    'id with spaces + plus',
  ])('round-trips %s', (id) => {
    const href = withOffer(APP, id)
    expect(offerIdFrom(new URL(href, APP).search)).toBe(id)
  })

  test('encodes ids the way the e2e deep links do', () => {
    expect(withOffer(APP, 'https://board.test/acme')).toBe(`/Job-offers/?offer=${encodeURIComponent('https://board.test/acme')}`)
  })
})

describe('isPushedOffer', () => {
  test('only the flag this tab sets when opening from the list', () => {
    expect(isPushedOffer({ joffersOffer: true })).toBe(true)
    for (const state of [null, undefined, {}, { joffersOffer: 'true' }, 'joffersOffer']) {
      expect(isPushedOffer(state), JSON.stringify(state)).toBe(false)
    }
  })
})

describe('closeOffer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Just enough of a browser: an offer opened from the list, and listeners to fire by hand.
  function openedFromList() {
    const listeners = new Map<string, () => void>()
    const back = vi.fn()
    vi.stubGlobal('location', { search: '?offer=a', href: `${APP}?offer=a` })
    vi.stubGlobal('history', { state: { joffersOffer: true }, back })
    vi.stubGlobal('window', { addEventListener: (type: string, listener: () => void) => listeners.set(type, listener) })
    return { back, fire: (type: string) => listeners.get(type)?.() }
  }

  test('a second close before the popstate goes back only once', () => {
    const { back, fire } = openedFromList()
    closeOffer()
    closeOffer()
    expect(back).toHaveBeenCalledTimes(1)

    fire('popstate')
    closeOffer()
    expect(back).toHaveBeenCalledTimes(2)
    fire('popstate')
  })

  test('a page back from the bfcache can close again', () => {
    const { back, fire } = openedFromList()
    closeOffer()
    fire('pageshow')
    closeOffer()
    expect(back).toHaveBeenCalledTimes(2)
    fire('popstate')
  })
})
