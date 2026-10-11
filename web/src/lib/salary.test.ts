import { describe, expect, test } from 'vitest'
import salaryPy from '../../../job_finder/salary.py?raw'
import fixture from './__fixtures__/breakdown.json'
import { APPROXIMATE_PLN_RATES, isPlnPerMonth, monthlySalaryPln, salaryPeriod, type SalaryFields } from './salary'
import scoreDefaults from './score-defaults.json'

const salary = (
  salary_min: number | null,
  salary_max: number | null,
  salary_currency: string | null,
  salary_period: string | null,
): SalaryFields => ({ salary_min, salary_max, salary_currency, salary_period })

interface FixtureCase {
  name: string
  job: SalaryFields
  breakdown: { salary_assessment: { estimated_monthly_pln: number | null } }
}

// score_job() rounds its estimate to 2 decimals before storing it.
const round2 = (value: number | null) => (value == null ? null : Math.round(value * 100) / 100)

describe('monthlySalaryPln parity with salary.py (breakdown.json)', () => {
  test.each(fixture.cases as unknown as FixtureCase[])('$name', ({ job, breakdown }) => {
    expect(round2(monthlySalaryPln(job, scoreDefaults.salary_bonus))).toBe(
      breakdown.salary_assessment.estimated_monthly_pln,
    )
  })
})

describe('monthlySalaryPln', () => {
  const cfg = scoreDefaults.salary_bonus

  test('uses the minimum of the range, or the only amount given', () => {
    expect(monthlySalaryPln(salary(20000, 25000, 'PLN', 'month'), cfg)).toBe(20000)
    expect(monthlySalaryPln(salary(null, 25000, 'PLN', 'month'), cfg)).toBe(25000)
    expect(monthlySalaryPln(salary(null, null, 'PLN', 'month'), cfg)).toBeNull()
  })

  test.each([
    ['hour', 140 * 160],
    ['hourly', 140 * 160],
    ['h', 140 * 160],
    ['day', 140 * 20],
    ['md', 140 * 20],
    ['month', 140],
    ['MONTHLY', 140],
    ['year', 140 / 12],
    ['annual', 140 / 12],
  ])('period %s', (period, expected) => {
    expect(monthlySalaryPln(salary(140, null, 'PLN', period), cfg)).toBe(expected)
  })

  test('an unknown period or currency gives no estimate', () => {
    expect(monthlySalaryPln(salary(140, null, 'PLN', ''), cfg)).toBeNull()
    expect(monthlySalaryPln(salary(140, null, 'PLN', 'week'), cfg)).toBeNull()
    expect(monthlySalaryPln(salary(5000, null, 'SEK', 'month'), cfg)).toBeNull()
  })

  test('no currency, PLN and zł all count as PLN; others use the approximate rate', () => {
    expect(monthlySalaryPln(salary(100, null, null, 'month'), cfg)).toBe(100)
    expect(monthlySalaryPln(salary(100, null, 'zł', 'month'), cfg)).toBe(100)
    expect(monthlySalaryPln(salary(100, null, 'eur', 'month'), cfg)).toBe(100 * APPROXIMATE_PLN_RATES.EUR)
  })

  test("hours and workdays per month come from the profile, else salary.py's defaults", () => {
    expect(monthlySalaryPln(salary(100, null, 'PLN', 'hour'), { hours_per_month: 168 })).toBe(16800)
    expect(monthlySalaryPln(salary(100, null, 'PLN', 'hour'))).toBe(16000)
    expect(monthlySalaryPln(salary(100, null, 'PLN', 'day'))).toBe(2000)
  })
})

test('salaryPeriod normalises the aliases salary.py accepts', () => {
  expect(['Hour', 'daily', 'mo', 'yearly', 'week', '', null].map(salaryPeriod)).toEqual(
    ['hour', 'day', 'month', 'year', null, null, null],
  )
})

test('isPlnPerMonth: only PLN per month needs no "≈ PLN/month" estimate', () => {
  expect(isPlnPerMonth(salary(20000, 25000, 'PLN', 'month'))).toBe(true)
  expect(isPlnPerMonth(salary(20000, 25000, null, 'monthly'))).toBe(true)
  expect(isPlnPerMonth(salary(140, 160, 'PLN', 'hour'))).toBe(false)
  expect(isPlnPerMonth(salary(5000, 6000, 'EUR', 'month'))).toBe(false)
})

// The table is copied, not shared, so read the Python source to catch drift.
test('APPROXIMATE_PLN_RATES mirrors job_finder/salary.py', () => {
  const table = /APPROXIMATE_PLN_RATES\s*=\s*\{([^}]*)\}/.exec(salaryPy)?.[1] ?? ''
  const pairs = [...table.matchAll(/"([A-Z]{3})"\s*:\s*([\d.]+)/g)].map(([, code, rate]) => [code, Number(rate)])
  const rates = Object.fromEntries(pairs)
  expect(Object.keys(rates).length).toBeGreaterThan(0)
  expect(APPROXIMATE_PLN_RATES).toEqual(rates)
})
