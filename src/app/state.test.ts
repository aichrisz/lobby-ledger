import { describe, expect, test } from 'vitest'
import { fakeStorage, failingStorage } from '../test/fake-storage'
import { STORAGE_KEY } from '../storage/store'
import { createLedgerApp } from './state'

const mkApp = (t = new Date(2026, 6, 10, 9, 0)) => {
  const storage = fakeStorage()
  let now = t
  const app = createLedgerApp(storage, () => now)
  return { app, storage, setNow: (d: Date) => { now = d } }
}

describe('createLedgerApp', () => {
  test('boots on clock shift with empty tasks', () => {
    const { app } = mkApp()
    expect(app.shift.value).toBe('frueh')
    expect(app.tasks.value).toEqual([])
    expect(app.recovered.value).toBe(false)
  })
  test('addTask appends, stamps current shift, persists', () => {
    const { app, storage } = mkApp()
    const t = app.addTask({ text: 'Zimmer 204: Wasserkocher defekt', ref: '204' })
    expect(t).not.toBeNull()
    expect(app.tasks.value).toHaveLength(1)
    expect(app.tasks.value[0]!.createdShift).toBe('frueh')
    expect(JSON.parse(storage.dump()[STORAGE_KEY]!).tasks).toHaveLength(1)
  })
  test('addTask with blank text returns null and changes nothing', () => {
    const { app, storage } = mkApp()
    expect(app.addTask({ text: '   ' })).toBeNull()
    expect(app.tasks.value).toEqual([])
    expect(storage.dump()[STORAGE_KEY]).toBeUndefined()
  })
  test('setStatus done stamps doneAt; back to open clears it', () => {
    const { app } = mkApp()
    const t = app.addTask({ text: 'Taxi bestellen' })!
    app.setStatus(t.id, 'done')
    expect(app.tasks.value[0]!.doneAt).not.toBeNull()
    app.setStatus(t.id, 'open')
    expect(app.tasks.value[0]!.doneAt).toBeNull()
  })
  test('removeTask + undoRemove restores the task and persists both times', () => {
    const { app, storage } = mkApp()
    const t = app.addTask({ text: 'Blumen gießen' })!
    app.removeTask(t.id)
    expect(app.tasks.value).toEqual([])
    expect(app.lastDeleted.value?.id).toBe(t.id)
    app.undoRemove()
    expect(app.tasks.value.map((x) => x.id)).toEqual([t.id])
    expect(app.lastDeleted.value).toBeNull()
    expect(JSON.parse(storage.dump()[STORAGE_KEY]!).tasks).toHaveLength(1)
  })
  test('setShift overrides and persists; refreshShift honors override until boundary', () => {
    const { app, setNow } = mkApp(new Date(2026, 6, 10, 13, 30))
    app.setShift('spaet')
    expect(app.shift.value).toBe('spaet')
    app.refreshShift()
    expect(app.shift.value).toBe('spaet') // still inside frueh window, override holds
    setNow(new Date(2026, 6, 10, 14, 5))
    app.refreshShift()
    expect(app.shift.value).toBe('spaet') // now clock agrees
    setNow(new Date(2026, 6, 10, 22, 5))
    app.refreshShift()
    expect(app.shift.value).toBe('nacht') // override expired at boundary
  })
  test('saveFailed flips true when storage rejects writes', () => {
    const app = createLedgerApp(failingStorage(), () => new Date(2026, 6, 10, 9, 0))
    app.addTask({ text: 'irgendwas' })
    expect(app.saveFailed.value).toBe(true)
  })
})
