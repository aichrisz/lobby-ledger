import { describe, expect, test } from 'vitest'
import type { Task } from '../domain/task'
import { fakeStorage, failingStorage } from '../test/fake-storage'
import {
  CURRENT_SCHEMA, DONE_RETENTION_DAYS, RECOVERY_KEY, STORAGE_KEY,
  emptyStore, loadStore, pruneTasks, runMigrations, saveStore, wipeStore,
} from './store'

const NOW = new Date(2026, 6, 10, 12, 0)
const task = (o: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(), text: 'Aufgabe', ref: '', department: 'front-office',
  priority: 'normal', status: 'open', createdAt: NOW.toISOString(),
  createdShift: 'frueh', doneAt: null, ...o,
})

describe('loadStore', () => {
  test('fresh device → empty store, not recovered', () => {
    expect(loadStore(fakeStorage(), NOW)).toEqual({ data: emptyStore(), recovered: false })
  })
  test('round-trips a saved store', () => {
    const s = fakeStorage()
    const data = { schema: CURRENT_SCHEMA, tasks: [task()], shiftOverride: null }
    expect(saveStore(s, data)).toBe(true)
    expect(loadStore(s, NOW)).toEqual({ data, recovered: false })
  })
  test('unparseable JSON → stash to recovery key, reset, recovered=true', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{broken' })
    const { data, recovered } = loadStore(s, NOW)
    expect(recovered).toBe(true)
    expect(data).toEqual(emptyStore())
    expect(s.dump()[RECOVERY_KEY]).toBe('{broken')
  })
  test('future/unknown schema → recovery path', () => {
    const s = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ schema: 99, tasks: [] }) })
    expect(loadStore(s, NOW).recovered).toBe(true)
  })
  test('invalid tasks are dropped and flag recovery; valid ones survive', () => {
    const good = task()
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ schema: 1, tasks: [good, { junk: true }], shiftOverride: null }),
    })
    const { data, recovered } = loadStore(s, NOW)
    expect(data.tasks).toEqual([good])
    expect(recovered).toBe(true)
  })
  test('invalid shiftOverride becomes null without recovery', () => {
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ schema: 1, tasks: [], shiftOverride: { shift: 'day', setAt: 'x' } }),
    })
    const { data, recovered } = loadStore(s, NOW)
    expect(data.shiftOverride).toBeNull()
    expect(recovered).toBe(false)
  })
})

describe('pruneTasks', () => {
  const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
  test('drops done tasks older than the retention window, keeps everything else', () => {
    const oldDone = task({ status: 'done', doneAt: days(DONE_RETENTION_DAYS + 1) })
    const freshDone = task({ status: 'done', doneAt: days(2) })
    const oldOpen = task({ createdAt: days(60) })
    expect(pruneTasks([oldDone, freshDone, oldOpen], NOW)).toEqual([freshDone, oldOpen])
  })
})

describe('runMigrations', () => {
  test('applies chained migrations up to the target schema', () => {
    const out = runMigrations(
      { schema: 1, tasks: [] },
      { 1: (o) => ({ ...o, schema: 2, extra: true }) },
      2,
    )
    expect(out).toEqual({ schema: 2, tasks: [], extra: true })
  })
  test('missing migration step → null (corrupt path)', () => {
    expect(runMigrations({ schema: 1, tasks: [] }, {}, 2)).toBeNull()
  })
  test('schema below 1 or non-integer → null', () => {
    expect(runMigrations({ schema: 0, tasks: [] }, {}, 1)).toBeNull()
    expect(runMigrations({ schema: 'x', tasks: [] }, {}, 1)).toBeNull()
  })
})

describe('saveStore / wipeStore', () => {
  test('saveStore returns false when storage throws (quota)', () => {
    expect(saveStore(failingStorage(), emptyStore())).toBe(false)
  })
  test('wipeStore removes both keys', () => {
    const s = fakeStorage({ [STORAGE_KEY]: '{}', [RECOVERY_KEY]: '{}' })
    wipeStore(s)
    expect(s.dump()).toEqual({})
  })
})
