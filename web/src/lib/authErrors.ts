// Sign-in errors as copy keys (plan §4.2). The raw message only ever goes in "Technical details".
export type SignInErrorKey = 'privateBeta' | 'rateLimit' | 'invalidEmail' | 'generic'

interface AuthErrorLike {
  message?: string
  status?: number
  code?: string
}

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

export function signInErrorKey(error: AuthErrorLike | null | undefined): SignInErrorKey {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  // Sign-ups are closed, so an unknown address comes back as "Signups not allowed for otp".
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups? not allowed/i.test(message)) {
    return 'privateBeta'
  }
  if (RATE_LIMIT_CODES.has(code) || error?.status === 429 || /rate limit/i.test(message)) return 'rateLimit'
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) return 'invalidEmail'
  return 'generic'
}
