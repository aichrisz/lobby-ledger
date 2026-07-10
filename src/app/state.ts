import { signal, type Signal } from '@preact/signals'
import type { NewTaskInput, Shift, Status, Task } from '../domain/task'
import { createTask } from '../domain/task'
import { resolveShift, type ShiftOverride } from '../domain/shift'
import { CURRENT_SCHEMA, loadStore, saveStore, type StorageLike } from '../storage/store'

export interface LedgerApp {
  tasks: Signal<Task[]>
  shift: Signal<Shift>
  recovered: Signal<boolean>
  saveFailed: Signal<boolean>
  lastDeleted: Signal<Task | null>
  now(): Date
  addTask(input: NewTaskInput): Task | null
  setStatus(id: string, status: Status): void
  removeTask(id: string): void
  undoRemove(): void
  setShift(shift: Shift): void
  refreshShift(): void
}

export function createLedgerApp(storage: StorageLike, now: () => Date = () => new Date()): LedgerApp {
  const loaded = loadStore(storage, now())
  let override: ShiftOverride | null = loaded.data.shiftOverride

  const tasks = signal(loaded.data.tasks)
  const shift = signal(resolveShift(now(), override))
  const recovered = signal(loaded.recovered)
  const saveFailed = signal(false)
  const lastDeleted = signal<Task | null>(null)

  const persist = () => {
    saveFailed.value = !saveStore(storage, {
      schema: CURRENT_SCHEMA,
      tasks: tasks.value,
      shiftOverride: override,
    })
  }

  return {
    tasks, shift, recovered, saveFailed, lastDeleted, now,
    addTask(input) {
      const task = createTask(input, now(), shift.value)
      if (task) {
        tasks.value = [...tasks.value, task]
        persist()
      }
      return task
    },
    setStatus(id, status) {
      tasks.value = tasks.value.map((t) =>
        t.id === id ? { ...t, status, doneAt: status === 'done' ? now().toISOString() : null } : t,
      )
      persist()
    },
    removeTask(id) {
      lastDeleted.value = tasks.value.find((t) => t.id === id) ?? null
      tasks.value = tasks.value.filter((t) => t.id !== id)
      persist()
    },
    undoRemove() {
      if (!lastDeleted.value) return
      tasks.value = [...tasks.value, lastDeleted.value]
      lastDeleted.value = null
      persist()
    },
    setShift(s) {
      override = { shift: s, setAt: now().toISOString() }
      shift.value = s
      persist()
    },
    refreshShift() {
      shift.value = resolveShift(now(), override)
    },
  }
}
