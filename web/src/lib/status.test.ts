import { describe, expect, test } from 'vitest'
import { isStatus, STATUS_GROUPS, STATUS_META, statusAtLeast } from './status'
import { STATUSES } from './types'

describe('status groups (§2.4)', () => {
  test('are the four optgroups, in pipeline order', () => {
    expect(STATUS_GROUPS).toEqual([
      { key: 'triage', statuses: ['TO_REVIEW', 'REVIEW'] },
      { key: 'preparing', statuses: ['INTERESTED', 'CV_GENERATED', 'READY_TO_APPLY'] },
      { key: 'active', statuses: ['APPLIED', 'INTERVIEW'] },
      { key: 'closed', statuses: ['REJECTED', 'WITHDRAWN'] },
    ])
  })

  test('cover every status exactly once', () => {
    expect(STATUS_GROUPS.flatMap((group) => group.statuses)).toEqual([...STATUSES])
  })
})

test('tones follow §2.4', () => {
  expect(Object.fromEntries(STATUSES.map((status) => [status, STATUS_META[status].tone]))).toEqual({
    TO_REVIEW: 'neutral',
    REVIEW: 'neutral',
    INTERESTED: 'brand',
    CV_GENERATED: 'brand',
    READY_TO_APPLY: 'brand',
    APPLIED: 'info',
    INTERVIEW: 'success',
    REJECTED: 'danger',
    WITHDRAWN: 'outline',
  })
})

test('statusAtLeast compares pipeline positions; no status is TO_REVIEW', () => {
  expect(statusAtLeast('INTERESTED', 'INTERESTED')).toBe(true)
  expect(statusAtLeast('APPLIED', 'READY_TO_APPLY')).toBe(true)
  expect(statusAtLeast('REVIEW', 'INTERESTED')).toBe(false)
  expect(statusAtLeast(null, 'TO_REVIEW')).toBe(true)
  expect(statusAtLeast(null, 'REVIEW')).toBe(false)
})

test('isStatus accepts only the statuses this build knows', () => {
  expect(STATUSES.every(isStatus)).toBe(true)
  expect([null, undefined, '', 'DISMISSED', 'applied'].some(isStatus)).toBe(false)
})
