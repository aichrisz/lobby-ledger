import type { LedgerShift, LedgerTask } from './api'

const SHIFT_LABELS: Record<LedgerShift, string> = { frueh: 'Früh', spaet: 'Spät', nacht: 'Nacht' }
const DEPARTMENT_LABELS = {
  'front-office': 'Front Office', housekeeping: 'Housekeeping', restaurant: 'Restaurant',
} as const

function germanDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}

export function buildBrief(date: string, shift: LedgerShift, initials: string, tasks: LedgerTask[]): string {
  const lines = tasks.map((task) => {
    const mark = task.status === 'done' ? 'x' : task.priority === 'wichtig' ? '!' : ' '
    const subject = task.ref ? `${task.ref} · ${task.text}` : task.text
    return `[${mark}] ${subject} (${DEPARTMENT_LABELS[task.department]})`
  })
  return [
    `Lobby Ledger – Übergabe`, `Datum: ${germanDate(date)}`, `Schicht: ${SHIFT_LABELS[shift]}`,
    `Kürzel: ${initials || '—'}`, '', ...lines,
  ].join('\n')
}
