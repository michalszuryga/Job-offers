import { STATUSES, type Status } from './types'

// Pill colours (plan §2.4); each tone maps to a token pair in the component CSS.
export type StatusTone = 'neutral' | 'brand' | 'info' | 'success' | 'danger' | 'outline'

export type StatusGroupKey = 'triage' | 'preparing' | 'active' | 'closed'

export const STATUS_META: Readonly<Record<Status, { tone: StatusTone; group: StatusGroupKey }>> = {
  TO_REVIEW: { tone: 'neutral', group: 'triage' },
  REVIEW: { tone: 'neutral', group: 'triage' },
  INTERESTED: { tone: 'brand', group: 'preparing' },
  CV_GENERATED: { tone: 'brand', group: 'preparing' },
  READY_TO_APPLY: { tone: 'brand', group: 'preparing' },
  APPLIED: { tone: 'info', group: 'active' },
  INTERVIEW: { tone: 'success', group: 'active' },
  REJECTED: { tone: 'danger', group: 'closed' },
  WITHDRAWN: { tone: 'outline', group: 'closed' },
  DISMISSED: { tone: 'outline', group: 'closed' },
}

const GROUP_ORDER: readonly StatusGroupKey[] = ['triage', 'preparing', 'active', 'closed']

// <optgroup>s for the Status selects, in pipeline order.
export const STATUS_GROUPS: readonly { key: StatusGroupKey; statuses: readonly Status[] }[] = GROUP_ORDER.map(
  (key) => ({ key, statuses: STATUSES.filter((status) => STATUS_META[status].group === key) }),
)

// The database may hold a status this build doesn't know yet (a newer one written by
// Streamlit or SQL first); the UI then shows no pill rather than crash or show the enum.
export function isStatus(value: unknown): value is Status {
  return STATUSES.includes(value as Status)
}

// Pipeline position, e.g. the Star hides at INTERESTED or later (§4.8). No status yet means TO_REVIEW.
// DISMISSED comes last, so it counts as past every stage.
export function statusAtLeast(status: Status | null, min: Status): boolean {
  return STATUSES.indexOf(status ?? 'TO_REVIEW') >= STATUSES.indexOf(min)
}
