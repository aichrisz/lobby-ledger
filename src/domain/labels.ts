import type { Department, Priority, Shift, Status } from './task'

export const SHIFT_LABELS: Record<Shift, string> = { frueh: 'Früh', spaet: 'Spät', nacht: 'Nacht' }
export const DEPARTMENT_LABELS: Record<Department, string> = {
  'front-office': 'Front Office', housekeeping: 'Housekeeping', restaurant: 'Restaurant',
}
export const PRIORITY_LABELS: Record<Priority, string> = { normal: 'Normal', wichtig: 'Wichtig' }
export const STATUS_LABELS: Record<Status, string> = { open: 'Offen', done: 'Erledigt' }
