import type { Shift } from '../domain/task'

export type Theme = 'light' | 'dark'

export function themeFor(shift: Shift, prefersDark: boolean): Theme {
  return shift === 'nacht' || prefersDark ? 'dark' : 'light'
}
