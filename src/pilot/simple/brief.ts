import type { LedgerTask } from './api'

function germanDate(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}

export function buildBrief(date: string, initials: string, tasks: LedgerTask[]): string {
  const lines = tasks.map((task) => `[${task.status === 'done' ? 'x' : ' '}] ${task.text}`)
  return [`Lobby Ledger – Übergabe`, `Datum: ${germanDate(date)}`, `Kürzel: ${initials || '—'}`, '', ...lines].join('\n')
}
