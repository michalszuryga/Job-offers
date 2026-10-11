import { describe, expect, test, vi } from 'vitest'
import { captureAuthHash, parseAuthHash, takeAuthNotice } from './authHash'

const EXPIRED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'

function fakeWindow(hash: string, pathname = '/Job-offers/', search = '') {
  const replaceState = vi.fn()
  return { location: { hash, pathname, search }, history: { state: { joffersOffer: true }, replaceState } }
}

describe('parseAuthHash', () => {
  test.each([
    [EXPIRED, 'linkExpired'],
    ['#error_code=otp_expired', 'linkExpired'],
    ['#error=server_error&error_description=Unable+to+exchange', 'linkExpired'],
    ['#access_token=abc&refresh_token=def&type=magiclink', null],
    ['#offers', null],
    ['', null],
  ] as const)('%s → %s', (hash, notice) => {
    expect(parseAuthHash(hash)).toBe(notice)
  })
})

describe('captureAuthHash', () => {
  test('remembers an expired link once and strips the fragment, keeping path, query and state', () => {
    const win = fakeWindow(EXPIRED, '/Job-offers/', '?offer=x')
    captureAuthHash(win)
    expect(win.history.replaceState).toHaveBeenCalledWith({ joffersOffer: true }, '', '/Job-offers/?offer=x')
    expect(takeAuthNotice()).toBe('linkExpired')
    expect(takeAuthNotice()).toBeNull()
  })

  test('leaves a sign-in fragment for supabase-js', () => {
    const win = fakeWindow('#access_token=abc&refresh_token=def&type=magiclink')
    captureAuthHash(win)
    expect(win.history.replaceState).not.toHaveBeenCalled()
    expect(takeAuthNotice()).toBeNull()
  })
})
