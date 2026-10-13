// Where the open offer sits in the list as filtered and sorted right now.
export interface ListPosition {
  index: number
  total: number
  previousId: string | null
  nextId: string | null
}

// "3 / 12", previous/next, and where "Not for me" moves on to (§4.8–4.9). The open offer
// always keeps its place, even once a change takes it out of the filter (opening one under
// "To review" marks it Reviewed), so next still means the one after it: `place` sorts it back
// in among the visible offers, the same way the list sorts them.
export function listPosition<T extends { external_id: string }>(
  visible: readonly T[],
  selected: T,
  place: (offers: T[]) => T[],
): ListPosition {
  const sequence = visible.includes(selected) ? visible : place([...visible, selected])
  const index = sequence.indexOf(selected)
  return {
    index,
    total: sequence.length,
    previousId: sequence[index - 1]?.external_id ?? null,
    nextId: sequence[index + 1]?.external_id ?? null,
  }
}
