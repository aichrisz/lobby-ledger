type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Anfrage')
  return value as JsonRecord
}

function exactFields(value: JsonRecord, allowed: string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unexpected fields')
}

export function parseLedgerDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ungültiges service date')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  if (date.toISOString().slice(0, 10) !== value) throw new Error('Ungültiges service date')
  return value
}

export function parseInitials(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Kürzel muss 2–4 Großbuchstaben enthalten')
  const initials = value.trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(initials)) throw new Error('Kürzel muss 2–4 Großbuchstaben enthalten')
  return initials
}

export const LEDGER_SHIFTS = ['frueh', 'spaet', 'nacht'] as const
export type LedgerShift = (typeof LEDGER_SHIFTS)[number]
export const LEDGER_DEPARTMENTS = ['front-office', 'housekeeping', 'restaurant'] as const
export type LedgerDepartment = (typeof LEDGER_DEPARTMENTS)[number]
export const LEDGER_PRIORITIES = ['normal', 'wichtig'] as const
export type LedgerPriority = (typeof LEDGER_PRIORITIES)[number]

export function parseShift(value: unknown): LedgerShift {
  if (typeof value !== 'string' || !LEDGER_SHIFTS.includes(value as LedgerShift)) {
    throw new Error('Ungültige Schicht')
  }
  return value as LedgerShift
}

function containsContactData(value: string): boolean {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/.test(value) || /\+?\d[\d\s/.\-]{7,}\d/.test(value)
}

function parseText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Aufgabe fehlt')
  const text = value.trim()
  if (text.length < 1 || text.length > 200) throw new Error('Aufgabe muss 1–200 Zeichen enthalten')
  if (containsContactData(text)) {
    throw new Error('Kontaktdaten gehören nicht in Aufgaben')
  }
  return text
}

function parseRef(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.trim().length > 24) throw new Error('Referenz darf höchstens 24 Zeichen enthalten')
  const reference = value.trim()
  if (containsContactData(reference)) throw new Error('Kontaktdaten gehören nicht in Aufgaben')
  return reference
}

function parseDepartment(value: unknown): LedgerDepartment {
  if (value === undefined) return 'front-office'
  if (typeof value !== 'string' || !LEDGER_DEPARTMENTS.includes(value as LedgerDepartment)) {
    throw new Error('Ungültige Abteilung')
  }
  return value as LedgerDepartment
}

function parsePriority(value: unknown): LedgerPriority {
  if (value === undefined) return 'normal'
  if (typeof value !== 'string' || !LEDGER_PRIORITIES.includes(value as LedgerPriority)) {
    throw new Error('Ungültige Priorität')
  }
  return value as LedgerPriority
}

export interface CreateTaskInput {
  date: string
  shift: LedgerShift
  initials: string
  text: string
  ref: string
  department: LedgerDepartment
  priority: LedgerPriority
}

export function parseCreateTask(value: unknown): CreateTaskInput {
  const input = record(value)
  exactFields(input, ['date', 'shift', 'initials', 'text', 'ref', 'department', 'priority'])
  return {
    date: parseLedgerDate(input.date), shift: parseShift(input.shift),
    initials: parseInitials(input.initials), text: parseText(input.text), ref: parseRef(input.ref),
    department: parseDepartment(input.department), priority: parsePriority(input.priority),
  }
}

export interface TaskPatchInput { date: string; shift: LedgerShift; initials: string; status: 'open' | 'done' }

export function parseTaskPatch(value: unknown): TaskPatchInput {
  const input = record(value)
  exactFields(input, ['date', 'shift', 'initials', 'status'])
  if (input.status !== 'open' && input.status !== 'done') throw new Error('Ungültiger Status')
  return {
    date: parseLedgerDate(input.date), shift: parseShift(input.shift),
    initials: parseInitials(input.initials), status: input.status,
  }
}
