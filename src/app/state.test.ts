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
  test('snapshot creation freezes task copies and receipt leaves task state untouched', () => {
    const { app, setNow } = mkApp()
    const task = app.addTask({ text: 'Taxi bestellen' })!
    expect(app.receiveSnapshot()).toBe(false)
    expect(app.createSnapshot()).toBe(true)
    const saved = app.handoverSnapshot.value!
    const savedTask = saved.brief.sections[0]!.tasks[0]!
    expect(savedTask).not.toBe(app.tasks.value[0])
    expect(savedTask.status).toBe('open')

    setNow(new Date(2026, 6, 10, 9, 1))
    app.setStatus(task.id, 'done')
    const taskAfterCompletion = app.tasks.value[0]
    expect(saved.brief.sections[0]!.tasks[0]!.status).toBe('open')
    expect(app.receiveSnapshot()).toBe(true)
    expect(app.tasks.value[0]).toEqual(taskAfterCompletion)
    const receivedAt = app.handoverSnapshot.value!.receivedAt
    setNow(new Date(2026, 6, 10, 9, 2))
    expect(app.receiveSnapshot()).toBe(false)
    expect(app.handoverSnapshot.value!.receivedAt).toBe(receivedAt)
  })
  test('task changes leave the saved snapshot unchanged; replacement resets receipt', () => {
    const { app, setNow } = mkApp()
    const first = app.addTask({ text: 'Lampe prüfen' })!
    app.createSnapshot()
    app.receiveSnapshot()
    const originalBrief = JSON.stringify(app.handoverSnapshot.value!.brief)

    app.setStatus(first.id, 'done')
    app.addTask({ text: 'Wasserkocher prüfen' })
    expect(JSON.stringify(app.handoverSnapshot.value!.brief)).toBe(originalBrief)

    setNow(new Date(2026, 6, 10, 9, 5))
    expect(app.createSnapshot()).toBe(true)
    expect(app.handoverSnapshot.value!.receivedAt).toBeNull()
    expect(app.handoverSnapshot.value!.brief.counts.open).toBe(1)
    expect(app.handoverSnapshot.value!.brief.counts.doneThisShift).toBe(1)
  })
  test('empty snapshot, reload, and wipe preserve the local lifecycle', () => {
    const { app, storage } = mkApp()
    expect(app.createSnapshot()).toBe(true)
    expect(app.handoverSnapshot.value!.brief.counts).toEqual({
      open: 0, wichtig: 0, doneThisShift: 0,
    })
    expect(app.receiveSnapshot()).toBe(true)

    const reloaded = createLedgerApp(storage, () => new Date(2026, 6, 10, 9, 1))
    expect(reloaded.handoverSnapshot.value).toEqual(app.handoverSnapshot.value)
    reloaded.wipe()
    expect(reloaded.handoverSnapshot.value).toBeNull()
    expect(storage.dump()[STORAGE_KEY]).toBeUndefined()
  })
  test('failed snapshot and receipt writes preserve the previous durable snapshot', () => {
    const durable = fakeStorage()
    let failWrites = false
    const storage = {
      getItem: (key: string) => durable.getItem(key),
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error('quota')
        durable.setItem(key, value)
      },
      removeItem: (key: string) => durable.removeItem(key),
    }
    let now = new Date(2026, 6, 10, 9, 0)
    const app = createLedgerApp(storage, () => now)
    app.addTask({ text: 'Lampe prüfen' })
    app.createSnapshot()
    const previous = app.handoverSnapshot.value
    const durableBeforeFailure = durable.dump()[STORAGE_KEY]
    failWrites = true
    now = new Date(2026, 6, 10, 9, 1)

    expect(app.createSnapshot()).toBe(false)
    expect(app.handoverSnapshot.value).toEqual(previous)
    expect(app.receiveSnapshot()).toBe(false)
    expect(app.handoverSnapshot.value).toEqual(previous)
    expect(durable.dump()[STORAGE_KEY]).toBe(durableBeforeFailure)
    expect(app.saveFailed.value).toBe(true)
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
  test('wipe clears tasks, transient deletion state, and persisted data', () => {
    const { app, storage } = mkApp()
    const task = app.addTask({ text: 'Lampe prüfen' })!
    app.removeTask(task.id)
    app.wipe()
    expect(app.tasks.value).toEqual([])
    expect(app.lastDeleted.value).toBeNull()
    expect(storage.dump()[STORAGE_KEY]).toBeUndefined()
  })
})
