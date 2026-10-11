import { describe, expect, test } from 'vitest'
import { codeErrorKey, signInErrorKey } from './authErrors'

describe('signInErrorKey', () => {
  test.each([
    [{ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' }, 'privateBeta'],
    [{ status: 422, message: 'Signups not allowed for otp' }, 'privateBeta'],
    [{ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'rateLimit'],
    [{ status: 429, message: 'Too many requests' }, 'rateLimit'],
    [{ status: 400, code: 'email_address_invalid', message: 'Email address "x" is invalid' }, 'invalidEmail'],
    [{ status: 500, message: 'Database error saving new user' }, 'generic'],
    [{ message: 'Failed to fetch' }, 'generic'],
    [null, 'generic'],
  ] as const)('%j → %s', (error, key) => {
    expect(signInErrorKey(error)).toBe(key)
  })
})

describe('codeErrorKey', () => {
  test.each([
    [{ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }, 'invalidCode'],
    [{ status: 403, message: 'Token has expired or is invalid' }, 'invalidCode'],
    [{ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' }, 'rateLimit'],
    [{ status: 500, message: 'Internal server error' }, 'codeFailed'],
    [{ message: 'Failed to fetch' }, 'codeFailed'],
    [null, 'codeFailed'],
  ] as const)('%j → %s', (error, key) => {
    expect(codeErrorKey(error)).toBe(key)
  })
})
