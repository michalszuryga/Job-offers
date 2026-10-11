import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Route } from '@playwright/test'

const HOUR = 3_600_000

export const OWNER = { id: '11111111-1111-1111-1111-111111111111', email: 'owner@example.com' }

// `hoursAgo` is relative to the mock's clock (MockOptions.now), resolved when served.
export function offer(id: string, title: string, company: string, score: number | null, hoursAgo: number | null, extra = {}) {
  return {
    external_id: `https://board.test/${id}`,
    url: `https://board.test/${id}`,
    title,
    company,
    score,
    source: 'JustJoin.IT',
    location: 'Remote',
    contract: 'B2B',
    salary_min: null as number | null,
    salary_max: null as number | null,
    salary_currency: null as string | null,
    salary_period: null as string | null,
    hoursAgo,
    application_status: 'TO_REVIEW',
    applied_rate: '',
    notice_period: '',
    applied_at: null,
    ...extra,
  }
}

export type MockOffer = ReturnType<typeof offer>

// Server order: score descending, like the real query.
export const OFFERS = [
  offer('gamma', 'Test Engineer', 'Gamma', 82, 120),
  offer('acme', 'Senior QA Engineer', 'Acme', 75, 3, {
    salary_min: 20000, salary_max: 25000, salary_currency: 'PLN', salary_period: 'month',
  }),
  offer('beta', 'QA Analyst', 'Beta', 60, 10, { source: 'No Fluff Jobs' }),
  offer('delta', 'QA Automation Engineer', 'Delta', 40, null),
]

// The last fetch's new offers (meta last_fetch_new_ids): Acme and Beta.
export const NEW_IDS = [OFFERS[1].external_id, OFFERS[2].external_id]

// The row as PostgREST returns it: published_at from hoursAgo against the mock's clock.
function served({ hoursAgo, ...row }: MockOffer, now: number) {
  return { ...row, published_at: hoursAgo === null ? null : new Date(now - hoursAgo * HOUR).toISOString() }
}

// Same shape as meta 'scoring_profile' from run_fetch (job_finder/rescore.py scoring_inputs);
// the scoring section is the real one, mirrored from profile.yaml.
const SCORING = JSON.parse(readFileSync(join(import.meta.dirname, '../src/lib/score-defaults.json'), 'utf8'))
export const SCORING_PROFILE = {
  candidate: {
    target_roles: ['QA Engineer', 'QA Analyst', 'Test Engineer', 'QA Automation Engineer'],
    seniority: ['mid', 'senior'],
    contracts: ['B2B', 'employment', 'contractor'],
    technologies: { strong: ['API testing', 'Postman', 'SQL', 'Playwright', 'TypeScript'], additional: ['DBeaver'] },
    domains: ['healthcare', 'fintech', 'SaaS'],
    ai: ['AI', 'Claude Code', 'GitHub Copilot'],
  },
  scoring: SCORING,
  filters: { minimum_score_to_show: 0, high_match_threshold: 80, remote_only: true },
  hard_exclusions: { technologies: ['Java'], seniority: ['intern', 'internship', 'junior'] },
  scoring_version: 2,
}

// What score_job() would put beside each offer's salary and title. The categories are fixed
// stand-ins (matched_* stay what app.spec reads until P7); for Acme they sum to its 75.
function breakdownFor(offer: MockOffer) {
  const { monthly_threshold_pln: threshold, points } = SCORING.salary_bonus
  const monthlyPln = offer.salary_currency === 'PLN' && offer.salary_period === 'month' ? offer.salary_min : null
  return {
    role: 20, technology: 10, domain: 0, remote: 15, contract: 10, seniority: 0, language: 0, ai: 0, freshness: 5,
    title_automation_penalty: /\bautomation\b/i.test(offer.title) ? -SCORING.penalties.automation_title : 0,
    title_programming_language_penalty: 0,
    stale_offer_penalty: 0,
    salary_bonus: monthlyPln != null && monthlyPln >= threshold ? points : 0,
    salary_assessment: {
      estimated_monthly_pln: monthlyPln,
      threshold_pln: threshold,
      minimum_of_range_used: offer.salary_min != null && offer.salary_max != null,
    },
    matched_roles: [], matched_technologies: ['playwright', 'typescript'], matched_domains: [], matched_ai: [],
  }
}

export interface MockOptions {
  member?: boolean
  // The offers in the database (default OFFERS), in server order.
  offers?: MockOffer[]
  // meta last_fetch_new_ids (default NEW_IDS).
  newIds?: string[]
  // The mock's clock in ms (default: the real time of each request). Pass the same instant
  // as page.clock.setFixedTime, so ages and "fetched 2 h ago" are fixed too.
  now?: number
  // The first N list requests fail with a raw server error.
  failJobs?: number
  // Visible offers in the database, when more than the list returns (the 2 000 limit).
  total?: number
  // How /auth/v1/otp answers: 'signupsDisabled' is GoTrue's reply for an address that has no
  // account while sign-ups are off (every stranger, in the private beta).
  otp?: 'ok' | 'signupsDisabled'
}

export interface MockState {
  rpcCalls: Record<string, unknown>[]
  otpRequests: Record<string, unknown>[]
  // Code sign-ins (verifyOtp); any code is accepted.
  verifyRequests: Record<string, unknown>[]
}

function fakeJwt(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role: 'authenticated', exp })}.signature`
}

// What GoTrue returns for a sign-in, and what supabase-js stores under 'joffers-auth'.
function ownerSession(expiresIn = 3600) {
  return {
    access_token: fakeJwt(OWNER.id),
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: { id: OWNER.id, email: OWNER.email, aud: 'authenticated', role: 'authenticated' },
  }
}

// `expired`: the stored access token is past its expiry, so supabase-js refreshes it on
// load, and the mock refuses the refresh (a revoked or long-expired session).
export async function signIn(page: Page, { expired = false } = {}) {
  const session = JSON.stringify(ownerSession(expired ? -60 : 3600))
  await page.addInitScript((value) => localStorage.setItem('joffers-auth', value), session)
}

// PostgREST filter values: "eq.x" or "in.(a,b,c)".
function filterValues(param: string | null): string[] | null {
  if (!param) return null
  if (param.startsWith('eq.')) return [param.slice(3)]
  const list = /^in\.\((.*)\)$/.exec(param)
  return list ? list[1].split(',').map((value) => value.replace(/^"|"$/g, '')) : null
}

export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<MockState> {
  const state: MockState = { rpcCalls: [], otpRequests: [], verifyRequests: [] }
  let jobFailures = options.failJobs ?? 0
  const offers = options.offers ?? OFFERS
  const newIds = options.newIds ?? NEW_IDS
  const now = () => options.now ?? Date.now()
  const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

  await page.route('http://supabase.test/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/auth/v1/otp') {
      // supabase-js sends emailRedirectTo as a query parameter, beside the JSON body.
      state.otpRequests.push({ ...request.postDataJSON(), redirect_to: url.searchParams.get('redirect_to') })
      if (options.otp === 'signupsDisabled') {
        return json(route, { code: 'otp_disabled', msg: 'Signups not allowed for otp', error_code: 'otp_disabled' }, 422)
      }
      return json(route, {})
    }
    if (path === '/auth/v1/verify') {
      state.verifyRequests.push(request.postDataJSON())
      return json(route, ownerSession())
    }
    if (path === '/auth/v1/token') {
      // Only refreshes reach this (code sign-in is /verify); the mock never renews a session.
      return json(route, { code: 'refresh_token_not_found', error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400)
    }
    if (path === '/auth/v1/user') return json(route, { id: OWNER.id, email: OWNER.email })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (path === '/rest/v1/app_members') {
      return json(route, options.member === false ? [] : [{ user_id: OWNER.id }])
    }
    if (path === '/rest/v1/meta') {
      const rows = [
        { meta_key: 'last_fetch_new_ids', meta_value: JSON.stringify(newIds) },
        { meta_key: 'scoring_profile', meta_value: JSON.stringify(SCORING_PROFILE) },
        { meta_key: 'scores_refreshed_on', meta_value: new Date(now()).toISOString().slice(0, 10) },
      ]
      const keys = filterValues(url.searchParams.get('meta_key'))
      return json(route, keys ? rows.filter((row) => keys.includes(row.meta_key)) : rows)
    }
    if (path === '/rest/v1/fetch_runs') {
      const finished = new Date(now() - 2 * HOUR).toISOString()
      return json(route, [{
        started_at: finished, finished_at: finished, trigger: 'schedule',
        results: JSON.stringify([
          { name: 'JustJoin.IT', candidates: 12, inserted: 1, rejected: 2, seconds: 4.2, error: '', error_type: '' },
          { name: 'No Fluff Jobs', candidates: 8, inserted: 0, rejected: 1, seconds: 6.8,
            error: 'offer 123: missing title', error_type: 'OfferParseError' },
          { name: 'Pracuj.pl', candidates: 0, inserted: 0, rejected: 0, seconds: 1.3,
            error: '403 Client Error: Forbidden for url: https://www.pracuj.pl/praca', error_type: 'HTTPError' },
        ]),
      }])
    }
    if (path === '/rest/v1/jobs') {
      const id = url.searchParams.get('external_id')?.replace(/^eq\./, '')
      if (id) {
        const match = offers.find((o) => o.external_id === id)
        if (!match) return json(route, { code: 'PGRST116', message: 'no rows' }, 406)
        return json(route, {
          ...served(match, now()),
          // Collapsed onto one line with glued bullets and headings, like real scraped text.
          description: `Full description of ${match.title}. Wymagania • Playwright i TypeScript • Testy API `
            + 'Oferujemy • Praca zdalna',
          score_breakdown: JSON.stringify(breakdownFor(match)),
        })
      }
      if (jobFailures > 0) {
        jobFailures -= 1
        return json(route, { code: '57014', message: 'canceling statement due to statement timeout', details: null,
          hint: null }, 500)
      }
      // count:'exact' reads the total from Content-Range ("0-3/4").
      const total = options.total ?? offers.length
      return json(route, offers.map((row) => served(row, now())), 200, {
        'Content-Range': `0-${offers.length - 1}/${total}`,
        'Access-Control-Expose-Headers': 'Content-Range',
      })
    }
    if (path === '/rest/v1/rpc/save_offer_tracking') {
      state.rpcCalls.push(request.postDataJSON())
      return route.fulfill({ status: 204 })
    }
    return json(route, { message: `unmocked ${request.method()} ${path}` }, 500)
  })
  return state
}
