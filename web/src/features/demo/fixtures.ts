import { SCORE_DEFAULTS, SCORE_MAX, type CategoryKey, type PenaltyKey } from '../../lib/score'
import { monthlySalaryPln } from '../../lib/salary'
import type { Dashboard, FetchRun, Offer, OfferDetails, ScoringProfile, Status } from '../../lib/types'

// The demo's sample data (§4.11) and the landing's phone preview. Every company, board and
// person here is made up: no real board is named on public pages until the legal review
// (§8 Q7). Times are relative to `now`, so the demo always looks like today's fetch,
// and the prerendered preview ages the same way it does in the browser.

const HOUR = 3_600_000
const DAY = 24 * HOUR

type Points = Partial<Record<CategoryKey | PenaltyKey, number>>

interface Sample {
  slug: string
  title: string
  company: string
  source: string
  location: string
  contract: string
  salary?: readonly [min: number, max: number, currency: string, period: 'hour' | 'month']
  hoursAgo: number
  status?: Status
  rate?: string
  notice?: string
  appliedDaysAgo?: number
  // What score_job() would give, by category; null for an offer not scored yet.
  points: Points | null
  terms?: { roles?: string[]; technologies?: string[]; domains?: string[]; ai?: string[] }
  // Collapsed onto one line, as the boards serve it (lib/description.ts rebuilds it).
  description: string
}

// The four boards of the sample fetch; Hirewave failed in the last run.
export const DEMO_SOURCES = ['Jobstack', 'Remotely', 'TestBoard', 'Hirewave'] as const

const SAMPLES: readonly Sample[] = [
  {
    slug: 'northbeam-senior-qa',
    title: 'Senior QA Engineer',
    company: 'Northbeam Health',
    source: 'Jobstack',
    location: 'Remote, Poland',
    contract: 'B2B',
    salary: [13000, 16000, 'PLN', 'month'],
    hoursAgo: 3,
    points: { role: 20, technology: 17, domain: 10, remote: 15, contract: 10, seniority: 5, language: 5, freshness: 10 },
    terms: { roles: ['qa engineer'], technologies: ['playwright', 'typescript', 'api testing', 'sql'], domains: ['healthcare'] },
    description:
      'Northbeam Health builds a patient portal used by 400 clinics across Europe. We are looking for a Senior QA Engineer to own the test strategy of the portal and its public API. Responsibilities • Design and maintain end-to-end tests in Playwright and TypeScript • Test REST APIs and write SQL to check data in PostgreSQL • Pair with developers on testability • Keep the CI pipeline fast and green Requirements • 5+ years in software testing • Strong Playwright or Cypress • API testing and SQL • Fluent English Benefits • 100% remote • B2B contract • Private medical care • Training budget',
  },
  {
    slug: 'kestrel-qa-api',
    title: 'QA Engineer (API, Postman)',
    company: 'Kestrel Cloud',
    source: 'Remotely',
    location: 'Remote',
    contract: 'B2B',
    salary: [140, 170, 'PLN', 'hour'],
    hoursAgo: 5,
    points: { role: 15, technology: 7, remote: 15, contract: 10, language: 5, freshness: 10, salary_bonus: 15 },
    terms: { roles: ['qa engineer'], technologies: ['postman', 'api testing'] },
    description:
      'Kestrel Cloud runs infrastructure monitoring for 2 000 engineering teams. Join the platform squad as a QA Engineer focused on our public API. Twoje zadania • Testy API w Postmanie i Newmanie • Projektowanie przypadków testowych dla nowych endpointów • Analiza logów i zgłaszanie błędów • Współpraca z zespołem w Berlinie i Warszawie Wymagania • 3+ lata doświadczenia w testowaniu • Bardzo dobra znajomość Postmana • Angielski na poziomie B2 Oferujemy • Stawka 140–170 PLN/h na B2B • Praca w pełni zdalna • Elastyczne godziny',
  },
  {
    slug: 'fernway-qa-automation',
    title: 'QA Automation Engineer',
    company: 'Fernway Logistics',
    source: 'Jobstack',
    location: 'Remote, EU',
    contract: 'Employment contract',
    salary: [12000, 15000, 'PLN', 'month'],
    hoursAgo: 9,
    points: {
      role: 20, technology: 21, remote: 15, contract: 10, seniority: 5, language: 5, ai: 5, freshness: 10,
      title_automation_penalty: -30,
    },
    terms: {
      roles: ['qa automation engineer'],
      technologies: ['playwright', 'typescript', 'api testing', 'github actions'],
      ai: ['github copilot'],
    },
    description:
      'Fernway Logistics plans delivery routes for 30 000 vans a day. We need an automation-minded QA engineer for our route planner. Zakres obowiązków • Rozwój testów end-to-end w Playwright i TypeScript • Testy kontraktowe API • Utrzymanie pipeline’ów w GitHub Actions Nasze wymagania • 4+ lata w automatyzacji testów • TypeScript na co dzień • Doświadczenie z narzędziami AI, np. GitHub Copilot Co oferujemy • Umowa o pracę • Praca zdalna w UE • Budżet szkoleniowy',
  },
  {
    slug: 'tidewater-test-mobile',
    title: 'Test Engineer, Mobile',
    company: 'Tidewater Games',
    source: 'TestBoard',
    location: 'Remote',
    contract: 'B2B',
    salary: [16000, 19000, 'PLN', 'month'],
    hoursAgo: 26,
    status: 'INTERESTED',
    points: { role: 15, technology: 6, remote: 15, contract: 10, seniority: 5, language: 5, freshness: 9, salary_bonus: 15 },
    terms: { roles: ['test engineer'], technologies: ['sql'] },
    description:
      'Tidewater Games makes puzzle games played by 12 million people a month. Help us ship weekly releases on iOS and Android without breaking a level. Responsibilities • Exploratory and regression testing on real devices • Writing clear bug reports with video • Checking analytics events with SQL Requirements • 3+ years testing mobile apps • Attention to detail • English B2+ Nice to have • Appium • A love of puzzle games',
  },
  {
    slug: 'brightline-qa-analyst',
    title: 'QA Analyst',
    company: 'Brightline Insurance',
    source: 'Jobstack',
    location: 'Remote, Poland',
    contract: 'Employment contract',
    salary: [11000, 14000, 'PLN', 'month'],
    hoursAgo: 50,
    status: 'APPLIED',
    rate: '13 500 PLN/month',
    notice: '1 month',
    appliedDaysAgo: 1,
    points: { role: 20, technology: 10, remote: 15, contract: 10, seniority: 5, language: 5, freshness: 7 },
    terms: { roles: ['qa analyst'], technologies: ['sql', 'postman'] },
    description:
      'Brightline Insurance is moving its policy system to the cloud. As a QA Analyst you will check that every policy, claim and payment still adds up. Obowiązki • Analiza wymagań i projektowanie testów • Testy manualne i API w Postmanie • Weryfikacja danych w SQL Wymagania • 2+ lata w QA • Dobra znajomość SQL • Komunikatywny angielski Benefity • Umowa o pracę • Praca zdalna • Pakiet medyczny i ubezpieczenie na życie',
  },
  {
    slug: 'aurora-senior-test-health',
    title: 'Senior Test Engineer (Healthcare)',
    company: 'Aurora Telemed',
    source: 'Remotely',
    location: 'Remote, EU',
    contract: 'B2B',
    salary: [5000, 6500, 'EUR', 'month'],
    hoursAgo: 74,
    status: 'INTERVIEW',
    rate: '6 000 EUR/month B2B',
    notice: '2 weeks',
    appliedDaysAgo: 2,
    points: {
      role: 15, technology: 8, domain: 10, remote: 15, contract: 10, seniority: 5, language: 5, freshness: 6,
      salary_bonus: 15,
    },
    terms: { roles: ['test engineer'], technologies: ['api testing', 'playwright'], domains: ['healthcare'] },
    description:
      'Aurora Telemed connects patients with doctors over video in six countries. Our product is regulated, so testing is part of how we ship, not an afterthought. About the role • You lead testing for the consultation app • You keep our test evidence audit-ready Requirements • 6+ years in testing • Experience with medical or other regulated software • API and UI automation, ideally Playwright Benefits • B2B in EUR • Remote across the EU • Four-day week in August',
  },
  {
    slug: 'quillmark-qa-ai',
    title: 'QA Engineer with AI tooling',
    company: 'Quillmark',
    source: 'TestBoard',
    location: 'Remote',
    contract: 'B2B',
    hoursAgo: 98,
    points: { role: 20, technology: 10, remote: 15, contract: 10, language: 5, ai: 5, freshness: 5 },
    terms: { roles: ['qa engineer'], technologies: ['typescript'], ai: ['ai', 'claude code'] },
    description:
      'Quillmark helps 900 schools write and grade assignments. We use AI in the product and in how we test it. Twoja rola • Testujesz funkcje oparte na modelach językowych • Budujesz zestawy przykładów do oceny odpowiedzi • Automatyzujesz testy w TypeScript Kogo szukamy? • Osoby z 3+ latami w QA • Ciekawości, jak testować AI • Doświadczenia z Claude Code lub podobnymi narzędziami Oferujemy • B2B • Pracę zdalną • Sprzęt do wyboru',
  },
  {
    slug: 'orbit-manual-qa',
    title: 'Manual QA Tester',
    company: 'Orbit Retail',
    source: 'Jobstack',
    location: 'Remote',
    contract: 'Employment contract',
    salary: [8000, 10000, 'PLN', 'month'],
    hoursAgo: 16 * 24,
    status: 'REVIEW',
    points: { role: 20, technology: 12, remote: 15, contract: 10, seniority: 5, language: 5, stale_offer_penalty: -15 },
    terms: { roles: ['qa tester'], technologies: ['sql', 'postman'] },
    description:
      'Orbit Retail runs online shops for 40 fashion brands. We are growing the QA team that tests checkout and payments. Wymagania • Doświadczenie w testach manualnych e-commerce • Podstawy SQL i Postmana • Angielski B1 Mile widziane • ISTQB Foundation Oferujemy • Umowę o pracę • Pracę zdalną • Zniżki na zakupy',
  },
  {
    slug: 'pinecrest-qa-lead',
    title: 'QA Lead',
    company: 'Pinecrest Bank',
    source: 'Remotely',
    location: 'Remote, EU',
    contract: 'Employment contract',
    salary: [26000, 32000, 'PLN', 'month'],
    hoursAgo: 5 * 24 + 3,
    status: 'REJECTED',
    points: { role: 8, technology: 10, domain: 10, remote: 15, contract: 10, language: 5, freshness: 4, salary_bonus: 15 },
    terms: { roles: ['qa'], technologies: ['sql', 'api testing'], domains: ['fintech'] },
    description:
      'Pinecrest Bank is a digital bank with 1.5 million customers. Lead a team of six testers across cards and payments. Responsibilities • Set the test strategy for two product lines • Coach testers and grow automation • Work with risk and compliance Requirements • 3+ years leading QA teams • Banking or payments background • SQL and API testing Benefits • Employment contract • Remote within the EU • Annual bonus',
  },
  {
    slug: 'cobalt-python-automation',
    title: 'Python Test Automation Developer',
    company: 'Cobalt Mobility',
    source: 'Hirewave',
    location: 'Remote',
    contract: 'B2B',
    salary: [18000, 22000, 'PLN', 'month'],
    hoursAgo: 6 * 24 + 5,
    status: 'WITHDRAWN',
    points: {
      role: 5, technology: 6, remote: 15, contract: 10, seniority: 5, language: 5, freshness: 3, salary_bonus: 15,
      title_automation_penalty: -30, title_programming_language_penalty: -30,
    },
    terms: { roles: ['test'], technologies: ['api testing'] },
    description:
      'Cobalt Mobility builds charging software for electric car fleets. Write test frameworks in Python for our charger firmware. Responsibilities • Develop pytest-based test frameworks • Simulate chargers and vehicles • Review code daily Requirements • 4+ years of Python development • Hardware-in-the-loop testing • English C1 Benefits • B2B • Remote • Car charging credits',
  },
  {
    slug: 'harbor-qa-specialist',
    title: 'QA Specialist',
    company: 'Harbor Analytics',
    source: 'TestBoard',
    location: 'Remote',
    contract: 'B2B',
    hoursAgo: 30,
    points: null,
    description:
      'Harbor Analytics turns shipping data into port schedules. We need a QA Specialist for a six-month project. O projekcie • Nowy panel dla operatorów portów • Zespół 8 osób Wymagania • Testy manualne i API • Podstawy SQL Oferujemy • B2B na 6 miesięcy z opcją przedłużenia • Pracę zdalną',
  },
  {
    slug: 'cedar-software-tester',
    title: 'Software Tester',
    company: 'Cedar Travel',
    source: 'Jobstack',
    location: 'Remote',
    contract: 'B2B',
    salary: [90, 110, 'PLN', 'hour'],
    hoursAgo: 9 * 24,
    points: { role: 10, technology: 6, remote: 15, contract: 10, language: 5, freshness: 1 },
    terms: { roles: ['tester'], technologies: ['postman'] },
    description:
      'Cedar Travel sells train and bus tickets in 14 countries. Test the booking flow before every release. Responsibilities • Regression testing of web and mobile booking • API checks in Postman Requirements • 1+ year in testing • English B2 Benefits • B2B • Remote • Free train tickets twice a year',
  },
]

// The last fetch's new offers: the three freshest.
const NEW_SLUGS = ['northbeam-senior-qa', 'kestrel-qa-api', 'fernway-qa-automation']

const idOf = (slug: string) => `demo:${slug}`

const sum = (points: Points) => Object.values(points).reduce((total, value) => total + (value ?? 0), 0)

// Clamped like score_job(), so every demo score reconciles with its breakdown.
const scoreOf = (points: Points | null) => (points ? Math.max(0, Math.min(SCORE_MAX, sum(points))) : null)

function offerOf(sample: Sample, now: number): Offer {
  const [min, max, currency, period] = sample.salary ?? [null, null, null, null]
  return {
    external_id: idOf(sample.slug),
    title: sample.title,
    company: sample.company,
    url: `https://example.com/joffers-demo/${sample.slug}`,
    source: sample.source,
    location: sample.location,
    contract: sample.contract,
    salary_min: min,
    salary_max: max,
    salary_currency: currency,
    salary_period: period,
    published_at: new Date(now - sample.hoursAgo * HOUR).toISOString(),
    score: scoreOf(sample.points),
    application_status: sample.status ?? 'TO_REVIEW',
    applied_rate: sample.rate ?? '',
    notice_period: sample.notice ?? '',
    applied_at: sample.appliedDaysAgo == null ? null : new Date(now - sample.appliedDaysAgo * DAY).toISOString(),
  }
}

// Every offer, best score first (unscored last), as loadDashboard returns them.
export function demoOffers(now: number): Offer[] {
  return SAMPLES.map((sample) => offerOf(sample, now)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
}

export const DEMO_NEW_IDS: ReadonlySet<string> = new Set(NEW_SLUGS.map(idOf))

// The landing's phone preview: the three new offers and one already marked, best first.
export function previewOffers(now: number): Offer[] {
  return demoOffers(now).filter((offer) => DEMO_NEW_IDS.has(offer.external_id) || offer.application_status === 'INTERESTED')
}

function lastRun(now: number): FetchRun {
  const finished = now - 2 * HOUR
  const ok = (name: string, candidates: number, inserted: number, seconds: number) =>
    ({ name, candidates, inserted, seconds, error: '', error_type: '' })
  return {
    started_at: new Date(finished - 40_000).toISOString(),
    finished_at: new Date(finished).toISOString(),
    trigger: 'schedule',
    results: [
      ok('Jobstack', 64, 2, 6.2),
      ok('Remotely', 31, 1, 3.8),
      ok('TestBoard', 22, 0, 2.9),
      {
        name: 'Hirewave',
        seconds: 1.2,
        error: '403 Client Error: Forbidden for url: https://hirewave.example/api/jobs',
        error_type: 'HTTPError',
      },
    ],
  }
}

// What run_fetch records as meta 'scoring_profile', for a made-up candidate.
const SCORING_PROFILE: ScoringProfile = {
  candidate: {
    target_roles: ['QA Engineer', 'QA Analyst', 'Test Engineer', 'QA Automation Engineer'],
    seniority: ['mid', 'senior'],
    contracts: ['B2B', 'employment'],
    technologies: { strong: ['Playwright', 'TypeScript', 'API testing', 'Postman', 'SQL'], additional: ['GitHub Actions'] },
    domains: ['healthcare', 'fintech'],
    ai: ['AI', 'Claude Code', 'GitHub Copilot'],
  },
  scoring: SCORE_DEFAULTS,
  scoring_version: 2,
}

// 'YYYY-MM-DD' in Warsaw: the demo's scores were refreshed with today's fetch.
const warsawDay = (time: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(time)

export function demoDashboard(now: number): Dashboard {
  const offers = demoOffers(now)
  return {
    offers,
    total: offers.length,
    newIds: new Set(DEMO_NEW_IDS),
    lastRun: lastRun(now),
    scoringProfile: SCORING_PROFILE,
    scoresRefreshedOn: warsawDay(now - 2 * HOUR),
  }
}

// score_job()'s breakdown for a sample: every category and penalty, the salary check and
// the matched terms, serialised the way jobs.score_breakdown stores it.
function breakdownOf(sample: Sample, offer: Offer): string | null {
  if (!sample.points) return null
  const salary = SCORE_DEFAULTS.salary_bonus ?? {}
  const keys = [
    'role', 'technology', 'domain', 'remote', 'contract', 'seniority', 'language', 'ai', 'freshness',
    'title_automation_penalty', 'title_programming_language_penalty', 'stale_offer_penalty', 'salary_bonus',
  ] as const
  const terms = sample.terms ?? {}
  return JSON.stringify({
    ...Object.fromEntries(keys.map((key) => [key, sample.points?.[key] ?? 0])),
    salary_assessment: {
      estimated_monthly_pln: monthlySalaryPln(offer, salary),
      threshold_pln: salary.monthly_threshold_pln,
      minimum_of_range_used: offer.salary_min != null && offer.salary_max != null,
    },
    matched_roles: terms.roles ?? [],
    matched_technologies: terms.technologies ?? [],
    matched_domains: terms.domains ?? [],
    matched_ai: terms.ai ?? [],
  })
}

export function demoDetails(offer: Offer): OfferDetails | null {
  const sample = SAMPLES.find((candidate) => idOf(candidate.slug) === offer.external_id)
  if (!sample) return null
  const terms = sample.terms ?? {}
  const keywords = [...(terms.roles ?? []), ...(terms.technologies ?? []), ...(terms.domains ?? []), ...(terms.ai ?? [])]
  return {
    ...offer,
    description: sample.description,
    score_breakdown: breakdownOf(sample, offer),
    matched_keywords: keywords.length ? keywords.join(', ') : null,
  }
}
