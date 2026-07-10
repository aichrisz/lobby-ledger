import type { Shift } from './task'

export interface ShiftOverride { shift: Shift; setAt: string }

export function shiftForTime(d: Date): Shift {
  const h = d.getHours()
  if (h >= 6 && h < 14) return 'frueh'
  if (h >= 14 && h < 22) return 'spaet'
  return 'nacht'
}

export function shiftWindowStart(now: Date): Date {
  const s = shiftForTime(now)
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  if (s === 'frueh') start.setHours(6)
  else if (s === 'spaet') start.setHours(14)
  else {
    start.setHours(22)
    if (now.getHours() < 6) start.setDate(start.getDate() - 1)
  }
  return start
}

export function resolveShift(now: Date, override: ShiftOverride | null): Shift {
  if (override) {
    const setAt = new Date(override.setAt)
    if (!Number.isNaN(setAt.getTime()) && setAt >= shiftWindowStart(now) && setAt <= now) {
      return override.shift
    }
  }
  return shiftForTime(now)
}

export function nextShift(s: Shift): Shift {
  return s === 'frueh' ? 'spaet' : s === 'spaet' ? 'nacht' : 'frueh'
}
