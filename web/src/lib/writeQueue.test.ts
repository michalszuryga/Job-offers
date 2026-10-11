import { describe, expect, test } from 'vitest'
import { changedFields, createWriteQueue, type Tracking } from './writeQueue'

// A fake save_offer_tracking whose calls the test settles by hand.
function controlledSave() {
  const calls: { id: string; tracking: Tracking; resolve: () => void; reject: (error: Error) => void }[] = []
  const save = (id: string, tracking: Tracking) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ id, tracking, resolve, reject })
    })
  return { save, calls }
}

// Lets queued promise callbacks run.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const BASE: Tracking = { status: 'TO_REVIEW', rate: '', notice: '' }

describe('createWriteQueue', () => {
  test('sends the confirmed tracking plus the change, since the RPC overwrites all three', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    const done = queue.enqueue('a', { status: 'APPLIED' }, { status: 'REVIEW', rate: '120 PLN/h', notice: '1 month' })
    await settle()
    expect(calls.map((c) => [c.id, c.tracking])).toEqual([
      ['a', { status: 'APPLIED', rate: '120 PLN/h', notice: '1 month' }],
    ])
    calls[0].resolve()
    await expect(done).resolves.toEqual({ status: 'APPLIED', rate: '120 PLN/h', notice: '1 month' })
  })

  test('serialises writes to one offer, in order', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    const first = queue.enqueue('a', { status: 'INTERESTED' }, BASE)
    const second = queue.enqueue('a', { status: 'APPLIED' }, BASE)
    await settle()
    expect(calls).toHaveLength(1)
    calls[0].resolve()
    await first
    await settle()
    expect(calls.map((c) => c.tracking.status)).toEqual(['INTERESTED', 'APPLIED'])
    calls[1].resolve()
    await expect(second).resolves.toMatchObject({ status: 'APPLIED' })
  })

  test('writes to different offers run in parallel', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    void queue.enqueue('a', { status: 'REVIEW' }, BASE)
    void queue.enqueue('b', { status: 'REVIEW' }, BASE)
    await settle()
    expect(calls.map((c) => c.id)).toEqual(['a', 'b'])
  })

  test('Save then an immediate Star keeps the new rate', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    // Both calls pass what the UI last saw confirmed: the Save has not landed yet.
    const saved = queue.enqueue('a', { status: 'REVIEW', rate: '140 PLN/h B2B', notice: '1 month' }, BASE)
    const starred = queue.enqueue('a', { status: 'INTERESTED' }, BASE)
    await settle()
    calls[0].resolve()
    await saved
    await settle()
    expect(calls[1].tracking).toEqual({ status: 'INTERESTED', rate: '140 PLN/h B2B', notice: '1 month' })
    calls[1].resolve()
    await expect(starred).resolves.toEqual({ status: 'INTERESTED', rate: '140 PLN/h B2B', notice: '1 month' })
  })

  test('a failure rejects for rollback and leaves the confirmed state untouched', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    const confirmed: Tracking = { status: 'REVIEW', rate: '100 PLN/h', notice: '' }
    const failing = queue.enqueue('a', { rate: '150 PLN/h' }, confirmed)
    const next = queue.enqueue('a', { status: 'APPLIED' }, confirmed)
    await settle()
    calls[0].reject(new Error('offline'))
    await expect(failing).rejects.toThrow('offline')
    await settle()
    // The queued write still runs, from the last confirmed rate, not the failed one.
    expect(calls[1].tracking).toEqual({ status: 'APPLIED', rate: '100 PLN/h', notice: '' })
    calls[1].resolve()
    await expect(next).resolves.toEqual({ status: 'APPLIED', rate: '100 PLN/h', notice: '' })
  })

  test("once idle, the next write starts from the caller's (possibly reloaded) state", async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    const first = queue.enqueue('a', { status: 'APPLIED' }, BASE)
    await settle()
    calls[0].resolve()
    await first
    await settle()
    const reloaded: Tracking = { status: 'INTERVIEW', rate: 'set on another device', notice: '2 weeks' }
    void queue.enqueue('a', { notice: '1 month' }, reloaded)
    await settle()
    expect(calls[1].tracking).toEqual({ status: 'INTERVIEW', rate: 'set on another device', notice: '1 month' })
  })

  test('undefined fields in a change do not blank the confirmed ones', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    void queue.enqueue('a', { status: 'APPLIED', rate: undefined }, { status: 'REVIEW', rate: '90', notice: '' })
    await settle()
    expect(calls[0].tracking).toEqual({ status: 'APPLIED', rate: '90', notice: '' })
  })
})

describe('changedFields', () => {
  test('keeps only what the form changed', () => {
    expect(changedFields({ status: 'TO_REVIEW', rate: '', notice: '1 month' }, BASE)).toEqual({ notice: '1 month' })
    expect(changedFields(BASE, BASE)).toEqual({})
    expect(changedFields({ status: 'APPLIED', rate: '140', notice: '' }, BASE)).toEqual({ status: 'APPLIED', rate: '140' })
  })

  test('a form opened on a stale row does not undo a write still in flight', async () => {
    const { save, calls } = controlledSave()
    const queue = createWriteQueue(save)
    // Save APPLIED; before it returns, the panel reopens from the old row and saves a notice.
    const applied = queue.enqueue('a', changedFields({ ...BASE, status: 'APPLIED' }, BASE), BASE)
    const notice = queue.enqueue('a', changedFields({ ...BASE, notice: '1 month' }, BASE), BASE)
    await settle()
    calls[0].resolve()
    await applied
    await settle()
    expect(calls[1].tracking).toEqual({ status: 'APPLIED', rate: '', notice: '1 month' })
    calls[1].resolve()
    await expect(notice).resolves.toEqual({ status: 'APPLIED', rate: '', notice: '1 month' })
  })
})
