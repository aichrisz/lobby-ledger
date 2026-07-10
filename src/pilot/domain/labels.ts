import type { GuestPurpose, HandoverStatus, PilotTaskStatus } from './handover'

export const HANDOVER_STATUS_LABELS: Record<HandoverStatus, string> = {
  draft: 'Entwurf', published: 'Veröffentlicht', acknowledged: 'Übernommen',
}
export const PILOT_TASK_STATUS_LABELS: Record<PilotTaskStatus, string> = {
  open: 'Offen', done: 'Erledigt', carried: 'Übertragen',
}
export const PURPOSE_LABELS: Record<GuestPurpose, string> = {
  callback: 'Rückruf',
  arrival: 'Anreise',
  complaint_follow_up: 'Beschwerde-Nachverfolgung',
  service_recovery: 'Service-Wiedergutmachung',
  other: 'Sonstiges (mit Begründung)',
}
