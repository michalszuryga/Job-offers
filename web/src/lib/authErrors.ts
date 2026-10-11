// Auth errors as copy keys (plan §4.2). The raw message only ever goes in "Technical details".
export type SignInErrorKey = 'privateBeta' | 'rateLimit' | 'invalidEmail' | 'generic'
// Entering the code from the e-mail (verifyOtp).
export type CodeErrorKey = 'invalidCode' | 'rateLimit' | 'codeFailed'
export type AuthErrorKey = SignInErrorKey | CodeErrorKey

interface AuthErrorLike {
  message?: string
  status?: number
  code?: string
}

const RATE_LIMIT_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit'])

function rateLimited(error: AuthErrorLike | null | undefined): boolean {
  return RATE_LIMIT_CODES.has(error?.code ?? '') || error?.status === 429 || /rate limit/i.test(error?.message ?? '')
}

export function signInErrorKey(error: AuthErrorLike | null | undefined): SignInErrorKey {
  const message = error?.message ?? ''
  const code = error?.code ?? ''
  // Sign-ups are closed, so an unknown address comes back as "Signups not allowed for otp".
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups? not allowed/i.test(message)) {
    return 'privateBeta'
  }
  if (rateLimited(error)) return 'rateLimit'
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) return 'invalidEmail'
  return 'generic'
}

// A wrong code and a used or expired one are the same error to the server (otp_expired,
// "Token has expired or is invalid"), so they share one message.
export function codeErrorKey(error: AuthErrorLike | null | undefined): CodeErrorKey {
  if (rateLimited(error)) return 'rateLimit'
  const message = error?.message ?? ''
  if (error?.code === 'otp_expired' || /token.*(expired|invalid)|(invalid|expired).*(otp|token|code)/i.test(message)) {
    return 'invalidCode'
  }
  return 'codeFailed'
}
