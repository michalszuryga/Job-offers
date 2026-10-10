import type { Page, Route } from '@playwright/test'

const HOUR = 3_600_000

export const OWNER = { id: '11111111-1111-1111-1111-111111111111', email: 'owner@example.com' }

function offer(id: string, title: string, company: string, score: number, hoursAgo: number | null, extra = {}) {
  return {
    external_id: `https://board.test/${id}`,
    url: `https://board.test/${id}`,
    title,
    company,
    score,
    source: 'JustJoin.IT',
    location: 'Remote',
    contract: 'B2B',
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    published_at: hoursAgo === null ? null : new Date(Date.now() - hoursAgo * HOUR).toISOString(),
    application_status: 'TO_REVIEW',
    applied_rate: '',
    notice_period: '',
    applied_at: null,
    ...extra,
  }
}

// Server order: score descending, like the real query.
export const OFFERS = [
  offer('gamma', 'Test Engineer', 'Gamma', 82, 120),
  offer('acme', 'Senior QA Engineer', 'Acme', 75, 3, {
    salary_min: 20000, salary_max: 25000, salary_currency: 'PLN', salary_period: 'month',
  }),
  offer('beta', 'QA Analyst', 'Beta', 60, 10, { source: 'No Fluff Jobs' }),
  offer('delta', 'QA Automation Engineer', 'Delta', 40, null),
]

export interface MockOptions {
  member?: boolean
}

export interface MockState {
  rpcCalls: Record<string, unknown>[]
  otpRequests: Record<string, unknown>[]
}

function fakeJwt(sub: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub, role: 'authenticated', exp })}.signature`
}

export async function signIn(page: Page) {
  const session = {
    access_token: fakeJwt(OWNER.id),
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: OWNER.id, email: OWNER.email, aud: 'authenticated', role: 'authenticated' },
  }
  await page.addInitScript((value) => localStorage.setItem('joffers-auth', value), JSON.stringify(session))
}

export async function mockSupabase(page: Page, options: MockOptions = {}): Promise<MockState> {
  const state: MockState = { rpcCalls: [], otpRequests: [] }
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  await page.route('http://supabase.test/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/auth/v1/otp') {
      state.otpRequests.push(request.postDataJSON())
      return json(route, {})
    }
    if (path === '/auth/v1/user') return json(route, { id: OWNER.id, email: OWNER.email })
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (path === '/rest/v1/app_members') {
      return json(route, options.member === false ? [] : [{ user_id: OWNER.id }])
    }
    if (path === '/rest/v1/meta') {
      return json(route, [{ meta_key: 'last_fetch_new_ids', meta_value: JSON.stringify([OFFERS[1].external_id]) }])
    }
    if (path === '/rest/v1/fetch_runs') {
      const finished = new Date(Date.now() - 2 * HOUR).toISOString()
      return json(route, [{
        started_at: finished, finished_at: finished, trigger: 'schedule',
        results: JSON.stringify([
          { name: 'JustJoin.IT', error: '', error_type: '' },
          { name: 'Pracuj.pl', error: '403 Forbidden', error_type: 'HTTPError' },
        ]),
      }])
    }
    if (path === '/rest/v1/jobs') {
      const id = url.searchParams.get('external_id')?.replace(/^eq\./, '')
      if (id) {
        const match = OFFERS.find((o) => o.external_id === id)
        return json(route, {
          ...match,
          description: `Full description of ${match?.title}.\nPlaywright, TypeScript, API testing.`,
          score_breakdown: JSON.stringify({ role: 20, technology: 25, remote: 15, title_automation_penalty: 0,
            matched_technologies: ['playwright', 'typescript'] }),
        })
      }
      return json(route, OFFERS)
    }
    if (path === '/rest/v1/rpc/save_offer_tracking') {
      state.rpcCalls.push(request.postDataJSON())
      return route.fulfill({ status: 204 })
    }
    return json(route, { message: `unmocked ${request.method()} ${path}` }, 500)
  })
  return state
}
