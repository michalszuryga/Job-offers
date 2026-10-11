import { describe, expect, test } from 'vitest'
import { errorKind, sourceHealth, sourceStats } from './sources'
import type { FetchRun, SourceRun } from './types'

const source = (name: string, error = '', error_type = '', extra: Partial<SourceRun> = {}): SourceRun => ({
  name, candidates: 10, inserted: 1, rejected: 0, seconds: 1.5, error, error_type, ...extra,
})
const run = (...results: SourceRun[]): FetchRun => ({
  started_at: '2026-05-04T16:00:00+00:00', finished_at: '2026-05-04T16:01:00+00:00', trigger: 'schedule', results,
})

describe('sourceHealth', () => {
  test('all fine', () => {
    expect(sourceHealth(run(source('A'), source('B')))).toEqual({
      state: 'ok', failed: [], partial: [], okCount: 2, total: 2,
    })
  })

  test('an OfferParseError is partial, not failed', () => {
    const parse = source('B', "Couldn't parse 2 offers", 'OfferParseError')
    expect(sourceHealth(run(source('A'), parse))).toEqual({
      state: 'partial', failed: [], partial: [parse], okCount: 1, total: 2,
    })
  })

  test('any failure wins over partial', () => {
    const blocked = source('Pracuj.pl', '403 Forbidden', 'HTTPError')
    const parse = source('B', 'x', 'OfferParseError')
    expect(sourceHealth(run(source('A'), blocked, parse))).toEqual({
      state: 'failed', failed: [blocked], partial: [parse], okCount: 1, total: 3,
    })
  })

  test('an exception with an empty message still fails the source', () => {
    const silent = source('X', '', 'AssertionError')
    const legacy = source('Y', 'boom', '')
    expect(sourceHealth(run(source('A'), silent, legacy))).toEqual({
      state: 'failed', failed: [silent, legacy], partial: [], okCount: 1, total: 3,
    })
  })

  test('no run yet', () => {
    expect(sourceHealth(null)).toEqual({ state: 'ok', failed: [], partial: [], okCount: 0, total: 0 })
  })
})

describe('errorKind', () => {
  test.each([
    ['403 Client Error: Forbidden for url: https://board.test/1', 'HTTPError', { kind: 'blocked', status: 403 }],
    ['401 Unauthorized', 'HTTPError', { kind: 'blocked', status: 401 }],
    ['https://board.test returned an anti-bot challenge page', 'BlockedError', { kind: 'blocked', status: null }],
    ['HTTPSConnectionPool: Read timed out. (read timeout=20)', 'ReadTimeout', { kind: 'timeout', status: null }],
    ['connect timeout', 'ConnectTimeout', { kind: 'timeout', status: null }],
    ['The operation timed out', 'OSError', { kind: 'timeout', status: null }],
    ['500 Server Error: Internal Server Error for url: https://board.test', 'HTTPError', { kind: 'unexpected', status: 500 }],
    ["'NoneType' object has no attribute 'text'", 'AttributeError', { kind: 'unexpected', status: null }],
    // A number inside the message isn't a status code.
    ['Expected 200 offers, got 3', 'ValueError', { kind: 'unexpected', status: null }],
  ])('%s (%s)', (error, error_type, expected) => {
    expect(errorKind({ error, error_type })).toEqual(expected)
  })
})

describe('sourceStats', () => {
  test('found · new · seconds, in that order', () => {
    expect(sourceStats(source('A', '', '', { candidates: 12, inserted: 3, seconds: 4.2 }))).toEqual([
      { key: 'found', value: 12 },
      { key: 'new', value: 3 },
      { key: 'seconds', value: 4.2 },
    ])
  })

  test('omits what an older run did not record', () => {
    expect(sourceStats({ name: 'A', error: '', error_type: '' })).toEqual([])
    expect(sourceStats({ name: 'A', inserted: 0 })).toEqual([{ key: 'new', value: 0 }])
  })
})
