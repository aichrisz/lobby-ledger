import { DEPARTMENTS, type Department, type Shift, type Task } from './task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from './labels'
import { nextShift, shiftWindowStart } from './shift'

export interface BriefSection { department: Department; tasks: Task[] }
export interface Brief {
  fromShift: Shift
  toShift: Shift
  generatedAt: string
  sections: BriefSection[]
  doneThisShift: Task[]
  counts: { open: number; wichtig: number; doneThisShift: number }
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
const pad = (v: number) => String(v).padStart(2, '0')

export function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

export function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const byPriorityThenOldest = (a: Task, b: Task) =>
  a.priority !== b.priority
    ? (a.priority === 'wichtig' ? -1 : 1)
    : a.createdAt.localeCompare(b.createdAt)

export function buildBrief(tasks: Task[], shift: Shift, now: Date): Brief {
  const open = tasks.filter((t) => t.status === 'open')
  const sections = DEPARTMENTS
    .map((d) => ({ department: d, tasks: open.filter((t) => t.department === d).sort(byPriorityThenOldest) }))
    .filter((s) => s.tasks.length > 0)
  const windowStart = shiftWindowStart(now).getTime()
  const doneThisShift = tasks
    .filter((t) => t.status === 'done' && t.doneAt !== null && Date.parse(t.doneAt) >= windowStart)
    .sort((a, b) => (b.doneAt as string).localeCompare(a.doneAt as string))
  return {
    fromShift: shift,
    toShift: nextShift(shift),
    generatedAt: now.toISOString(),
    sections,
    doneThisShift,
    counts: {
      open: open.length,
      wichtig: open.filter((t) => t.priority === 'wichtig').length,
      doneThisShift: doneThisShift.length,
    },
  }
}

export function carriedOverLabel(task: Task, now: Date): string {
  if (Date.parse(task.createdAt) >= shiftWindowStart(now).getTime()) return ''
  const d = new Date(task.createdAt)
  return `seit ${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${SHIFT_LABELS[task.createdShift]}`
}

export function formatBriefText(brief: Brief): string {
  const now = new Date(brief.generatedAt)
  const lines: string[] = [
    `ÜBERGABE ${SHIFT_LABELS[brief.fromShift]} → ${SHIFT_LABELS[brief.toShift]} · ${formatDateShort(brief.generatedAt)} · ${formatTimeShort(brief.generatedAt)}`,
    '',
    `OFFEN (${brief.counts.open})`,
  ]
  if (brief.sections.length === 0) lines.push('', 'Keine offenen Aufgaben. Gute Übergabe!')
  for (const s of brief.sections) {
    lines.push('', DEPARTMENT_LABELS[s.department])
    for (const t of s.tasks) {
      const mark = t.priority === 'wichtig' ? '!' : '·'
      const ref = t.ref ? `${t.ref} — ` : ''
      const age = carriedOverLabel(t, now)
      lines.push(`  ${mark} ${ref}${t.text}${age ? ` (${age})` : ''}`)
    }
  }
  if (brief.doneThisShift.length > 0) {
    lines.push('', `ERLEDIGT DIESE SCHICHT (${brief.doneThisShift.length})`)
    for (const t of brief.doneThisShift) {
      lines.push(`  · ${t.ref ? `${t.ref} — ` : ''}${t.text}`)
    }
  }
  return lines.join('\n')
}

export function briefFilename(brief: Brief): string {
  const d = new Date(brief.generatedAt)
  return `uebergabe-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${brief.fromShift}.txt`
}
