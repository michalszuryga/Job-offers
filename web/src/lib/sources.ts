import type { FetchRun, SourceRun } from './types'

export type SourceState = 'ok' | 'partial' | 'failed'

export interface SourceHealth {
  state: SourceState
  failed: SourceRun[]
  // Fetched, but some offers couldn't be parsed (OfferParseError).
  partial: SourceRun[]
  okCount: number
  total: number
}

const PARSE_ERROR = 'OfferParseError'

// The collector records the exception's type and its message, which can be empty
// (AssertionError()), so the type decides, as it does for collector.py's listing_ok.
const isPartial = (r: SourceRun) => r.error_type === PARSE_ERROR
const isFailed = (r: SourceRun) => (r.error_type ? !isPartial(r) : Boolean(r.error))

// One source's row in SourcesSheet.
export function sourceState(result: SourceRun): SourceState {
  return isFailed(result) ? 'failed' : isPartial(result) ? 'partial' : 'ok'
}

export function sourceHealth(run: FetchRun | null): SourceHealth {
  const results = run?.results ?? []
  const failed = results.filter(isFailed)
  const partial = results.filter(isPartial)
  const state: SourceState = failed.length ? 'failed' : partial.length ? 'partial' : 'ok'
  return { state, failed, partial, okCount: results.length - failed.length - partial.length, total: results.length }
}

export type SourceErrorKind = 'blocked' | 'timeout' | 'unexpected'

export interface SourceError {
  kind: SourceErrorKind
  // HTTP status when the error names one, e.g. "403 Client Error: Forbidden for url: …".
  status: number | null
}

// requests' exception names, plus collector's BlockedError for anti-bot challenge pages.
const TIMEOUT_TYPES = new Set(['Timeout', 'ReadTimeout', 'ConnectTimeout', 'TimeoutError'])

export function errorKind(result: Pick<SourceRun, 'error' | 'error_type'>): SourceError {
  const code = /^\s*([1-5]\d\d)\b/.exec(result.error ?? '')
  const status = code ? Number(code[1]) : null
  if (status === 401 || status === 403 || result.error_type === 'BlockedError') return { kind: 'blocked', status }
  if (TIMEOUT_TYPES.has(result.error_type) || /timed out/i.test(result.error ?? '')) return { kind: 'timeout', status }
  return { kind: 'unexpected', status }
}

export type SourceStatKey = 'found' | 'new' | 'seconds'

// "12 found · 3 new · 4.2 s". Runs recorded before these fields existed simply lack them.
export function sourceStats(result: Partial<SourceRun>): { key: SourceStatKey; value: number }[] {
  const fields: [SourceStatKey, unknown][] = [
    ['found', result.candidates],
    ['new', result.inserted],
    ['seconds', result.seconds],
  ]
  return fields
    .filter((field): field is [SourceStatKey, number] => typeof field[1] === 'number' && Number.isFinite(field[1]))
    .map(([key, value]) => ({ key, value }))
}
