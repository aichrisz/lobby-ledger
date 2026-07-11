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

function parseText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Aufgabe fehlt')
  const text = value.trim()
  if (text.length < 1 || text.length > 200) throw new Error('Aufgabe muss 1–200 Zeichen enthalten')
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/.test(text) || /\+?\d[\d\s/.\-]{7,}\d/.test(text)) {
    throw new Error('Kontaktdaten gehören nicht in Aufgaben')
  }
  return text
}

export interface CreateTaskInput { date: string; initials: string; text: string }

export function parseCreateTask(value: unknown): CreateTaskInput {
  const input = record(value)
  exactFields(input, ['date', 'initials', 'text'])
  return { date: parseLedgerDate(input.date), initials: parseInitials(input.initials), text: parseText(input.text) }
}

export interface TaskPatchInput { date: string; initials: string; status: 'open' | 'done' }

export function parseTaskPatch(value: unknown): TaskPatchInput {
  const input = record(value)
  exactFields(input, ['date', 'initials', 'status'])
  if (input.status !== 'open' && input.status !== 'done') throw new Error('Ungültiger Status')
  return { date: parseLedgerDate(input.date), initials: parseInitials(input.initials), status: input.status }
}
