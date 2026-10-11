// The owner's contact and name, set per deploy (web-pages.yml; see web/.env.example).
// Empty in a bare local build, so callers hide what needs them.
export const CONTACT_EMAIL: string = import.meta.env.VITE_CONTACT_EMAIL ?? ''
export const CONTROLLER_NAME: string = import.meta.env.VITE_CONTROLLER_NAME ?? ''

// Kept in English whatever the UI language, so the owner can filter on it.
const REQUEST_SUBJECT = 'JOffers access request'

// "Request access" is a mailto for now (plan §8: no waitlist table in v1).
export function accessRequestHref(body: string): string | null {
  if (!CONTACT_EMAIL) return null
  const query = new URLSearchParams({ subject: REQUEST_SUBJECT, body })
  // mailto wants %20, not the + that URLSearchParams writes for a space.
  return `mailto:${CONTACT_EMAIL}?${query.toString().replaceAll('+', '%20')}`
}
