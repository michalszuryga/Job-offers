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

// Segment labels in the toolbar (§4.5): short enough for five beside the Filters button.
const windows: Record<PublishedWindow, string> = {
  new: 'New',
  '24h': '24 h',
  '3d': '3 days',
  '7d': '7 days',
  any: 'Any time',
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
    // Kit defaults: the sheet's close button, the toast's dismiss button and its actions.
    close: 'Close',
    dismiss: 'Dismiss',
    retry: 'Retry',
    undo: 'Undo',
  },
  app: {
    signOut: 'Sign out',
  },
  login: {
    title: 'Sign in',
    tagline: 'QA jobs, scored for you.',
    email: 'Email',
    hint: 'No password. We’ll email you a one-time link.',
    send: 'Send sign-in link',
    // The address goes between the two halves, in bold.
    sent: { before: 'Check your inbox — we sent a sign-in link to ', after: '.' },
    resent: { before: 'We sent a new sign-in link to ', after: '.' },
    anyDevice: 'Works on any device. Check spam.',
    openGmail: 'Open Gmail',
    resend: 'Resend link',
    resendIn: (seconds: number) => `Resend in ${seconds} s`,
    differentEmail: 'Use a different email',
    // The path for the installed iOS app, where the link opens in Safari instead.
    haveCode: 'Have a code? Enter it',
    code: '6-digit code',
    codeHint: 'It’s in the same email as the link.',
    verify: 'Sign in',
    notices: {
      linkExpired: 'This sign-in link has expired or was already used. Send a new one.',
      sessionExpired: 'Your session expired. Sign in again.',
    },
    // privateBeta is followed by a "Request access" mailto when a contact address is set.
    requestAccess: 'Request access',
    requestBody: (email: string) => `Hi, I'd like access to JOffers for ${email}.`,
    errors: {
      privateBeta: 'JOffers is in private beta.',
      rateLimit: 'Too many attempts. Wait a minute.',
      invalidEmail: 'Enter a valid email.',
      generic: "Couldn't send the sign-in link. Try again.",
      invalidCode: 'That code is wrong or has expired. Check it, or send a new link.',
      codeFailed: "Couldn't sign you in with that code. Try again.",
    },
  },
  accessGate: {
    noAccess: "This account doesn't have access yet.",
    privateBeta: 'JOffers is in private beta.',
    signedInAs: (email: string) => `Signed in as ${email}`,
    requestAccess: 'Request access',
    requestBody: (email: string) => `Hi, I'd like access to JOffers for ${email}.`,
    signOut: 'Sign out',
    // The visually hidden heading of the error state, whose callout says what happened.
    checkHeading: 'Access check',
    checkFailed: "Couldn't check your access.",
    retry: 'Retry',
  },
  // Plan §4.11. Processor names stay as written; the controller and contact come from the build.
  privacy: {
    title: 'Privacy policy',
    updated: (date: string) => `Last updated ${date}`,
    back: 'Back to JOffers',
    signOut: 'Sign out',
    signOutFailed: "Couldn't sign out. Check your connection.",
    intro:
      'JOffers scores QA job offers for a small group of private-beta members. This page explains what personal data the app uses, why, and what you can do about it.',
    controller: {
      heading: 'Who is responsible',
      body: (name: string) => `The controller of your personal data is ${name}, who runs JOffers.`,
      // A local build without VITE_CONTROLLER_NAME.
      unnamed: 'The controller of your personal data is the person who runs JOffers.',
      contact: 'Questions and requests:',
    },
    data: {
      heading: 'What data we use',
      email: 'Your email address, to sign you in. Sign-in links and codes are sent to it.',
      tracking:
        'What you record about offers: application status, the rate you quoted, the notice period you gave, and the date you first marked an offer as applied.',
      logs: 'Technical logs kept by the services listed below, such as IP addresses and request times.',
      offers: 'The offers themselves come from public job boards and are not data about you.',
    },
    basis: {
      heading: 'Why, and on what legal basis',
      account: 'To provide your account and the app you asked to use: GDPR Art. 6(1)(b), performance of a contract.',
      security:
        'To keep the service secure and stop abuse, through the security logs our processors keep: GDPR Art. 6(1)(f), legitimate interest.',
    },
    processors: {
      heading: 'Who processes it for us',
      intro: 'JOffers relies on these services as processors:',
      supabase: 'database and authentication. Your data is stored in the EU (AWS eu-west-1, Ireland).',
      google: 'Gmail’s SMTP service sends the sign-in emails and the daily summary.',
      github: 'hosts the app on GitHub Pages and keeps request logs, including IP addresses.',
      transfers:
        'Google and GitHub may process data outside the European Economic Area, under the safeguards set out in their own terms.',
    },
    storage: {
      heading: 'What JOffers keeps in your browser',
      intro: 'JOffers sets no cookies. It keeps these entries in your browser’s local storage:',
      entry: 'Entry',
      purpose: 'Purpose',
      purposes: {
        'joffers-auth': 'Keeps you signed in (your Supabase session).',
        'joffers-theme': 'Your theme: auto, light or dark.',
        'joffers-lang': 'Your language.',
        'joffers-filters': 'Your list filters and sort order.',
        'joffers-seen': 'Offers you opened, until that is saved to your account.',
        'joffers-shortcuts': 'Whether keyboard shortcuts are on.',
      },
      clear: 'Signing out removes your session; clearing this site’s data in your browser removes the rest.',
    },
    noTracking: {
      heading: 'No analytics, no ads',
      body: 'JOffers has no analytics, no ads and no tracking. Your data is never sold or used for marketing.',
    },
    retention: {
      heading: 'How long we keep it',
      account: 'Your account and tracking data: until you ask us to delete them.',
      offers: 'Offers you only opened, or never touched: they expire 14 days after they leave their job board.',
      logs: 'Logs kept by the services above: as set out in their own policies.',
    },
    rights: {
      heading: 'Your rights',
      list: 'You can ask to access your data, have it corrected or erased, restrict its processing or get it in a portable format, and you can object to processing based on legitimate interest.',
      how: 'To use any of these rights, email',
      complaint:
        'You can also complain to the Polish supervisory authority, the President of the Personal Data Protection Office (PUODO):',
    },
  },
  offers: {
    loading: 'Loading offers…',
    loadError: "Couldn't load offers. Check your connection.",
    count: (shown: number, total: number) =>
      `${formatNumber(shown, 'en')} of ${formatNumber(total, 'en')} ${offerWord(total)}`,
    // Shown when the list query hits its row limit.
    showingFirst: (n: number) => `Showing the first ${formatNumber(n, 'en')} ${offerWord(n)}`,
    // Empty states (§4.10).
    empty: 'No offers match these filters',
    clearFilters: 'Clear filters',
    // When only the time window hides everything.
    showAll: 'Show all offers',
    emptyNew: 'No new offers from the last fetch',
    // Warsaw time, when the scheduled fetch runs.
    nextFetch: (today: boolean) => (today ? 'Next fetch today at 18:00' : 'Next fetch tomorrow at 18:00'),
    showRecent: 'Show last 3 days',
    // Sentence case; the badge draws it in capitals (§2.4).
    newBadge: 'New',
  },
  // The last fetch's batch, above the list (§4.5).
  batch: {
    summary: (n: number, ago: string) => `${formatNumber(n, 'en')} new · fetched ${ago}`,
    // A run whose finish time can't be read.
    summaryUndated: (n: number) => `${formatNumber(n, 'en')} new`,
    noFetch: 'No fetch yet',
    reviewed: (done: number, total: number) => `Reviewed ${formatNumber(done, 'en')} of ${formatNumber(total, 'en')}`,
    refresh: 'Refresh offers',
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
    // The first Min score chip; the others are "50+", "65+", "80+".
    anyScore: 'Any score',
    search: 'Search title or company',
    // The search field's clear (×) button.
    clearSearch: 'Clear search',
    sortLabel: 'Sort',
    sort,
    // The Filters sheet's footer.
    reset: 'Reset',
    show: (n: number) => `Show ${formatNumber(n, 'en')} ${offerWord(n)}`,
    clearAll: 'Clear all',
    // The chips row under the toolbar on phones; each chip removes its filter.
    active: 'Active filters',
    remove: (label: string) => `Remove filter: ${label}`,
    scoreChip: (min: number) => `Score ${min}+`,
    queryChip: (query: string) => `“${query}”`,
  },
  // Desktop, while no offer is open (§4.7).
  summary: {
    heading: 'Summary',
    newTitle: 'New since the last fetch',
    toReview: (n: number) => `${formatNumber(n, 'en')} still to review`,
    allReviewed: 'All reviewed',
    bestTitle: 'Best new match',
    openBest: 'Open best match',
    noBest: 'Nothing new to open',
    progressTitle: 'In progress',
    progressDetail: (preparing: number, active: number) =>
      `${formatNumber(preparing, 'en')} preparing · ${formatNumber(active, 'en')} active`,
    sourcesTitle: 'Sources OK',
    sourcesValue: (ok: number, total: number) => `${formatNumber(ok, 'en')}/${formatNumber(total, 'en')}`,
    viewSources: 'View sources',
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
    notListed: 'No salary listed',
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
    fetched: (ago: string) => `Fetched ${ago}`,
    allOk: 'All sources fetched',
    // A badge on each row, so the state never rests on the icon's colour.
    states: { ok: 'OK', partial: 'Partial', failed: 'Failed' },
  },
  // "Status: Applied · Undo" and its failure "Couldn't save the status · Retry" (§4.9);
  // the action labels come from common.
  toast: {
    status: (label: string) => `Status: ${label}`,
    statusFailed: "Couldn't save the status",
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
  // App bar and account menu (§4.4). Language names stay in their own language (AccountMenu).
  shell: {
    skipToOffers: 'Skip to offers',
    // The view's h1, for screen readers; the list itself shows no title.
    heading: 'Offers',
    account: 'Account',
    // Before the email, in the menu's header.
    signedInAs: 'Signed in as',
    language: 'Language',
    signOut: 'Sign out',
  },
  theme: {
    label: 'Theme',
    options: { auto: 'Auto', light: 'Light', dark: 'Dark' },
  },
  notFound: {
    title: 'Page not found',
    body: "This page doesn't exist or has moved.",
    home: 'Go to JOffers',
  },
  offline: {
    message: "You're offline. Reconnect to load offers and save changes.",
  },
  // A route chunk that failed to load (main.tsx's error boundary).
  boot: {
    failed: "Couldn't load JOffers. Check your connection.",
    reload: 'Reload',
  },
}

// Literal strings widen to string, so pl.ts can say anything as long as the shape matches.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { [K in keyof T]: Widen<T[K]> }

export type Messages = Widen<typeof en>
