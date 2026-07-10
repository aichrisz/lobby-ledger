export const SHIFTS = ['frueh', 'spaet', 'nacht'] as const
export type Shift = (typeof SHIFTS)[number]
export const DEPARTMENTS = ['front-office', 'housekeeping', 'restaurant'] as const
export type Department = (typeof DEPARTMENTS)[number]
export const PRIORITIES = ['normal', 'wichtig'] as const
export type Priority = (typeof PRIORITIES)[number]
export const STATUSES = ['open', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const TEXT_MAX = 200
export const REF_MAX = 24

export interface Task {
  id: string
  text: string
  ref: string
  department: Department
  priority: Priority
  status: Status
  createdAt: string
  createdShift: Shift
  doneAt: string | null
}

export interface NewTaskInput {
  text: string
  ref?: string
  department?: Department
  priority?: Priority
}

export function createTask(input: NewTaskInput, now: Date, shift: Shift): Task | null {
  const text = input.text.trim()
  const ref = (input.ref ?? '').trim()
  if (text.length === 0 || text.length > TEXT_MAX || ref.length > REF_MAX) return null
  return {
    id: crypto.randomUUID(),
    text, ref,
    department: input.department ?? 'front-office',
    priority: input.priority ?? 'normal',
    status: 'open',
    createdAt: now.toISOString(),
    createdShift: shift,
    doneAt: null,
  }
}

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v)
}
function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

export function parseTask(raw: unknown): Task | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length === 0) return null
  if (typeof r.text !== 'string' || r.text.trim().length === 0 || r.text.length > TEXT_MAX) return null
  if (typeof r.ref !== 'string' || r.ref.length > REF_MAX) return null
  if (!isOneOf(DEPARTMENTS, r.department)) return null
  if (!isOneOf(PRIORITIES, r.priority)) return null
  if (!isOneOf(STATUSES, r.status)) return null
  if (!isIso(r.createdAt)) return null
  if (!isOneOf(SHIFTS, r.createdShift)) return null
  if (r.doneAt !== null && !isIso(r.doneAt)) return null
  return {
    id: r.id, text: r.text, ref: r.ref, department: r.department,
    priority: r.priority, status: r.status, createdAt: r.createdAt,
    createdShift: r.createdShift, doneAt: r.doneAt as string | null,
  }
}
