import type { Shift } from '../../domain/task'

export interface ShiftContext {
  serviceDate: string // 'YYYY-MM-DD' in Europe/Berlin
  shift: Shift
}

const BERLIN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** Berlin wall clock for an instant: calendar date string + hour. */
export function berlinClock(now: Date): { date: string; hour: number; minute: number } {
  const p: Record<string, string> = {}
  for (const part of BERLIN.formatToParts(now)) p[part.type] = part.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) }
}

/**
 * Service-date convention: Nacht (22:00–06:00) belongs to the calendar date it
 * STARTS on. Berlin 00:00–05:59 therefore resolves to the previous day's Nacht.
 */
export function serviceContext(now: Date): ShiftContext {
  const c = berlinClock(now)
  if (c.hour >= 6 && c.hour < 14) return { serviceDate: c.date, shift: 'frueh' }
  if (c.hour >= 14 && c.hour < 22) return { serviceDate: c.date, shift: 'spaet' }
  return { serviceDate: c.hour >= 22 ? c.date : addDays(c.date, -1), shift: 'nacht' }
}

export function addDays(serviceDate: string, delta: number): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

/** Default receiving context: shift rotation; Nacht rolls to the next date. */
export function nextTargetContext(ctx: ShiftContext): ShiftContext {
  if (ctx.shift === 'frueh') return { serviceDate: ctx.serviceDate, shift: 'spaet' }
  if (ctx.shift === 'spaet') return { serviceDate: ctx.serviceDate, shift: 'nacht' }
  return { serviceDate: addDays(ctx.serviceDate, 1), shift: 'frueh' }
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
const pad = (v: number) => String(v).padStart(2, '0')

export function formatServiceDate(serviceDate: string): string {
  const [y, m, d] = serviceDate.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]
  return `${weekday}, ${pad(d!)}.${pad(m!)}.${y}`
}
