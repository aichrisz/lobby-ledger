import { SHIFTS, parseTask, type Shift, type Task } from '../domain/task'
import type { ShiftOverride } from '../domain/shift'

export const STORAGE_KEY = 'lobby-ledger.store'
export const RECOVERY_KEY = 'lobby-ledger.recovered'
export const CURRENT_SCHEMA = 1
export const DONE_RETENTION_DAYS = 14

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface StoreData {
  schema: number
  tasks: Task[]
  shiftOverride: ShiftOverride | null
}
export interface LoadResult { data: StoreData; recovered: boolean }

export function emptyStore(): StoreData {
  return { schema: CURRENT_SCHEMA, tasks: [], shiftOverride: null }
}

type Migration = (old: Record<string, unknown>) => Record<string, unknown>
// Registry of schema upgrades: MIGRATIONS[n] converts schema n → n+1.
export const MIGRATIONS: Record<number, Migration> = {}

export function runMigrations(
  obj: Record<string, unknown>,
  migrations: Record<number, Migration>,
  target: number,
): Record<string, unknown> | null {
  let current = obj
  let schema = typeof current.schema === 'number' ? current.schema : NaN
  if (!Number.isInteger(schema) || schema < 1 || schema > target) return null
  while (schema < target) {
    const step = migrations[schema]
    if (!step) return null
    current = step(current)
    schema = typeof current.schema === 'number' ? current.schema : NaN
    if (!Number.isInteger(schema)) return null
  }
  return current
}

function parseOverride(raw: unknown): ShiftOverride | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.shift !== 'string' || !(SHIFTS as readonly string[]).includes(r.shift)) return null
  if (typeof r.setAt !== 'string' || Number.isNaN(Date.parse(r.setAt))) return null
  return { shift: r.shift as Shift, setAt: r.setAt }
}

function recover(storage: StorageLike, raw: string): LoadResult {
  try {
    storage.setItem(RECOVERY_KEY, raw)
  } catch {
    // storage full — recovery copy skipped, reset still proceeds
  }
  return { data: emptyStore(), recovered: true }
}

export function loadStore(storage: StorageLike, now: Date): LoadResult {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return { data: emptyStore(), recovered: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return recover(storage, raw)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return recover(storage, raw)
  const migrated = runMigrations(parsed as Record<string, unknown>, MIGRATIONS, CURRENT_SCHEMA)
  if (migrated === null || !Array.isArray(migrated.tasks)) return recover(storage, raw)
  const rawTasks = migrated.tasks as unknown[]
  const tasks = rawTasks.map(parseTask).filter((t): t is Task => t !== null)
  return {
    data: {
      schema: CURRENT_SCHEMA,
      tasks: pruneTasks(tasks, now),
      shiftOverride: parseOverride(migrated.shiftOverride),
    },
    recovered: tasks.length !== rawTasks.length,
  }
}

export function saveStore(storage: StorageLike, data: StoreData): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function pruneTasks(tasks: Task[], now: Date): Task[] {
  const cutoff = now.getTime() - DONE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return tasks.filter(
    (t) => t.status === 'open' || t.doneAt === null || Date.parse(t.doneAt) >= cutoff,
  )
}

export function wipeStore(storage: StorageLike): void {
  storage.removeItem(STORAGE_KEY)
  storage.removeItem(RECOVERY_KEY)
}
