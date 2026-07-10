import type { Department, Shift } from '../../domain/task'

export const HANDOVER_STATUSES = ['draft', 'published', 'acknowledged'] as const
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number]

export const TASK_STATUSES = ['open', 'done', 'carried'] as const
export type PilotTaskStatus = (typeof TASK_STATUSES)[number]

export const GUEST_PURPOSES = [
  'callback', 'arrival', 'complaint_follow_up', 'service_recovery', 'other',
] as const
export type GuestPurpose = (typeof GUEST_PURPOSES)[number]

export interface HandoverTuple {
  serviceDate: string
  sourceShift: Shift
  sourceDepartment: Department
  targetShift: Shift
  targetDepartment: Department
}

const TRANSITIONS: Record<HandoverStatus, HandoverStatus[]> = {
  draft: ['published'],
  published: ['acknowledged'],
  acknowledged: [],
}

export function canTransition(from: HandoverStatus, to: HandoverStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** A handover must address a different shift or a different department. */
export function isValidTuple(t: HandoverTuple): boolean {
  return t.sourceShift !== t.targetShift || t.sourceDepartment !== t.targetDepartment
}

export function tupleKey(t: HandoverTuple): string {
  return [t.serviceDate, t.sourceShift, t.sourceDepartment, t.targetShift, t.targetDepartment].join('|')
}
