import type { Offer } from './types'

// Port of job_finder/salary.py. The parity test pins this to score_job()'s own
// estimate (breakdown.json), so "≈ PLN/month" and the salary bonus never disagree.
export const APPROXIMATE_PLN_RATES: Readonly<Record<string, number>> = { EUR: 4.4, USD: 4.0, GBP: 5.2, CHF: 4.7 }

export type SalaryPeriod = 'hour' | 'day' | 'month' | 'year'

export type SalaryFields = Pick<Offer, 'salary_min' | 'salary_max' | 'salary_currency' | 'salary_period'>

// The scoring.salary_bonus section of the profile; missing keys use salary.py's defaults.
export interface SalaryConfig {
  monthly_threshold_pln?: number
  points?: number
  hours_per_month?: number
  workdays_per_month?: number
}

const PERIOD_ALIASES: Record<string, SalaryPeriod> = {
  hour: 'hour', hourly: 'hour', h: 'hour',
  day: 'day', daily: 'day', md: 'day',
  month: 'month', monthly: 'month', mo: 'month',
  year: 'year', yearly: 'year', annual: 'year',
}

const PLN_CURRENCIES = new Set(['', 'PLN', 'ZŁ'])

export function salaryPeriod(period: string | null): SalaryPeriod | null {
  return PERIOD_ALIASES[(period ?? '').toLowerCase()] ?? null
}

function plnRate(currency: string | null): number | null {
  const code = (currency ?? '').toUpperCase()
  return PLN_CURRENCIES.has(code) ? 1 : (APPROXIMATE_PLN_RATES[code] ?? null)
}

// The minimum of the range, in PLN per month, or null when the period or currency is unknown.
export function monthlySalaryPln(offer: SalaryFields, salaryCfg: SalaryConfig = {}): number | null {
  const low = offer.salary_min ?? offer.salary_max
  if (low == null) return null
  const rate = plnRate(offer.salary_currency)
  if (rate == null) return null
  // Same operation order as salary.py, so the floats match to the last digit.
  let monthly: number
  switch (salaryPeriod(offer.salary_period)) {
    case 'hour': monthly = low * (salaryCfg.hours_per_month ?? 160); break
    case 'day': monthly = low * (salaryCfg.workdays_per_month ?? 20); break
    case 'year': monthly = low / 12; break
    case 'month': monthly = low; break
    default: return null
  }
  return monthly * rate
}

// Already in PLN per month, so an "≈ … PLN/month" estimate would only repeat it.
export function isPlnPerMonth(offer: SalaryFields): boolean {
  return plnRate(offer.salary_currency) === 1 && salaryPeriod(offer.salary_period) === 'month'
}
