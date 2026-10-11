import type { SortKey } from '../lib/format'
import type { PublishedWindow } from '../lib/prefs'
import type { SalaryPeriod } from '../lib/salary'
import type { CategoryKey, PenaltyKey, ScoreBand } from '../lib/score'
import type { SourceErrorKind, SourceStatKey } from '../lib/sources'
import type { StatusGroupKey } from '../lib/status'
import type { Status } from '../lib/types'
import { enPlural, formatNumber } from './intl'

// English UI copy, the source of truth for Messages: pl.ts must provide every key.
// Voice (§2.1): numbers first, second person, never "Error:" plus raw text.

const statuses: Record<Status, string> = {
  TO_REVIEW: 'To review',
  REVIEW: 'Reviewed',
  INTERESTED: 'Interested',
  CV_GENERATED: 'CV ready',
  READY_TO_APPLY: 'Ready to apply',
  APPLIED: 'Applied',
  INTERVIEW: 'Interview',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

const statusGroups: Record<StatusGroupKey, string> = {
  triage: 'Triage',
  preparing: 'Preparing',
  active: 'Active',
  closed: 'Closed',
}

const windows: Record<PublishedWindow, string> = {
  any: 'Any time',
  '24h': 'Last 24 hours',
  '3d': 'Last 3 days',
  '7d': 'Last 7 days',
}

const sort: Record<SortKey, string> = { score: 'Best match', newest: 'Newest', salary: 'Highest salary' }

const periods: Record<SalaryPeriod, string> = { hour: '/h', day: '/day', month: '/month', year: '/year' }

const bands: Record<ScoreBand, string> = {
  top: 'Top match',
  strong: 'Strong match',
  fair: 'Fair match',
  low: 'Low match',
  none: 'Not scored',
}

// Labels match scoring.py's categories one to one (§4.8).
const rows: Record<CategoryKey, string> = {
  role: 'Role',
  technology: 'Technologies',
  domain: 'Domain',
  remote: 'Remote',
  contract: 'Contract',
  seniority: 'Seniority',
  language: 'English',
  ai: 'AI',
  freshness: 'Freshness',
  salary_bonus: 'Salary bonus',
}

// Every penalty takes the stale threshold so callers needn't special-case one key.
const penalties: Record<PenaltyKey, (days: number) => string> = {
  title_automation_penalty: () => '"Automation" in title',
  title_programming_language_penalty: () => 'Programming language in title',
  stale_offer_penalty: (days) => `Older than ${days} ${enPlural(days, 'day', 'days')}`,
}

const sourceErrors: Record<SourceErrorKind, (status: number | null) => string> = {
  blocked: (status) => (status ? `Blocked by the board (${status})` : 'Blocked by the board'),
  timeout: () => 'Timed out',
  unexpected: (status) => (status ? `Unexpected error (${status})` : 'Unexpected error'),
}

const sourceStats: Record<SourceStatKey, (value: number) => string> = {
  found: (n) => `${formatNumber(n, 'en')} found`,
  new: (n) => `${formatNumber(n, 'en')} new`,
  seconds: (s) => `${formatNumber(s, 'en', 1)} s`,
}

const offerWord = (n: number) => enPlural(n, 'offer', 'offers')

export const en = {
  common: {
    loading: 'Loading…',
    tryAgain: 'Try again',
    technicalDetails: 'Technical details',
    newCount: (n: number) => `${formatNumber(n, 'en')} new`,
  },
  app: {
    signOut: 'Sign out',
    checkingAccess: 'Checking access…',
    accessError: "Couldn't check your access. Try reloading.",
    noAccess: "This account doesn't have access yet.",
  },
  login: {
    tagline: 'QA jobs, scored for you.',
    email: 'Email',
    send: 'Send sign-in link',
    sending: 'Sending…',
    // The address goes between the two halves, in bold.
    sent: { before: 'Check your inbox — we sent a sign-in link to ', after: '.' },
    errors: {
      // No demo or "Request access" yet (P5/P8), so no call to action pointing at them.
      privateBeta: "JOffers is in private beta and this email isn't on the list yet.",
      rateLimit: 'Too many attempts. Wait a minute.',
      invalidEmail: 'Enter a valid email.',
      generic: "Couldn't send the sign-in link. Try again.",
    },
  },
  offers: {
    loading: 'Loading offers…',
    loadError: "Couldn't load offers. Check your connection.",
    lastFetch: (ago: string, newCount: number) => `Last fetch ${ago} · ${formatNumber(newCount, 'en')} new`,
    // A run whose finish time can't be read.
    lastFetchUndated: (newCount: number) => `Last fetch · ${formatNumber(newCount, 'en')} new`,
    noFetch: 'No fetch yet',
    failedSources: (names: string) => `failed: ${names}`,
    count: (shown: number, total: number) =>
      `${formatNumber(shown, 'en')} of ${formatNumber(total, 'en')} ${offerWord(total)}`,
    // Shown when the list query hits its row limit.
    showingFirst: (n: number) => `Showing the first ${formatNumber(n, 'en')} ${offerWord(n)}`,
    empty: 'No offers match these filters.',
    // Literal capitals until P6 restyles the badge (app.spec reads "NEWSenior QA Engineer").
    newBadge: 'NEW',
  },
  filters: {
    label: 'Filters',
    published: 'Published',
    windows,
    status: 'Status',
    allStatuses: 'All statuses',
    source: 'Source',
    allSources: 'All sources',
    minScore: 'Min score',
    search: 'Search title or company',
    sortLabel: 'Sort',
    sort,
  },
  status: statuses,
  statusGroups,
  details: {
    label: 'Offer details',
    back: '← Back to list',
    published: (ago: string) => `published ${ago}`,
    publishedUnknown: 'Publication date unknown',
    openOffer: 'Open original offer',
    status: 'Status',
    rate: 'Rate you quoted',
    ratePlaceholder: 'e.g. 120 PLN/h B2B',
    notice: 'Notice period you gave',
    noticePlaceholder: 'e.g. 1 month',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',
    saveError: "Couldn't save. Try again.",
    score: (score: number) => `Score ${score}`,
    matched: (terms: string) => `Matched: ${terms}`,
    description: 'Description',
    noDescription: 'No description.',
    loadError: "Couldn't load the details. Check your connection and open the offer again.",
  },
  salary: {
    notListed: 'Salary not listed',
    periods,
    approxMonthly: (amount: string) => `≈ ${amount} PLN/month`,
  },
  score: {
    bands,
    rows,
    penalties,
    ring: (score: number, band: string) => `Match ${score} of 100, ${band}`,
    breakdown: 'Score breakdown',
    // `points` arrives signed and formatted ("+20").
    points: (points: string, max: number) => `${points} / ${max}`,
    zeroRows: (n: number) => `${formatNumber(n, 'en')} ${enPlural(n, 'category', 'categories')} with no points`,
    total: (total: number, max: number) => `Total ${total} / ${max}`,
    capped: 'capped at 100',
    floored: 'floored at 0',
    matchedKeywords: 'Matched keywords',
    hardExclusions:
      'Filtered out before scoring: non-remote roles, junior roles (unless the pay is high), and technologies on your exclusion list.',
  },
  sources: {
    title: 'Sources',
    errors: sourceErrors,
    partial: "Some offers couldn't be read",
    stats: sourceStats,
    failedOne: (name: string) => `${name} failed`,
    failedMany: (n: number) => `${formatNumber(n, 'en')} ${enPlural(n, 'source', 'sources')} failed`,
    partialCount: (n: number) => `${formatNumber(n, 'en')} ${enPlural(n, 'source', 'sources')} partial`,
  },
  time: {
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    daysAgo: (n: number) => `${n} ${enPlural(n, 'day', 'days')} ago`,
    now: 'now',
    minutes: (n: number) => `${n} min`,
    hours: (n: number) => `${n} h`,
    days: (n: number) => `${n} d`,
    unknown: 'date unknown',
  },
}

// Literal strings widen to string, so pl.ts can say anything as long as the shape matches.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> }

export type Messages = Widen<typeof en>
