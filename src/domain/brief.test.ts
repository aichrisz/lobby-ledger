import { describe, expect, test } from 'vitest'
import type { Task } from './task'
import { briefFilename, buildBrief, carriedOverLabel, formatBriefText } from './brief'

const base: Task = {
  id: 'x', text: 'Aufgabe', ref: '', department: 'front-office', priority: 'normal',
  status: 'open', createdAt: new Date(2026, 6, 8, 9, 12).toISOString(),
  createdShift: 'frueh', doneAt: null,
}
let n = 0
const mk = (o: Partial<Task>): Task => ({ ...base, id: `t${n++}`, ...o })
const NOW = new Date(2026, 6, 8, 13, 58) // Mi 08.07.2026, Früh window (06:00–14:00)

describe('buildBrief', () => {
  test('groups open tasks by department in fixed order, omitting empty departments', () => {
    const brief = buildBrief(
      [mk({ department: 'restaurant' }), mk({ department: 'front-office' })], 'frueh', NOW)
    expect(brief.sections.map((s) => s.department)).toEqual(['front-office', 'restaurant'])
  })
  test('sorts wichtig first, then oldest first within a department', () => {
    const fresh = mk({})
    const old = mk({ createdAt: new Date(2026, 6, 7, 8, 0).toISOString() })
    const wichtig = mk({ priority: 'wichtig' })
    const brief = buildBrief([fresh, old, wichtig], 'frueh', NOW)
    expect(brief.sections[0]!.tasks.map((t) => t.id)).toEqual([wichtig.id, old.id, fresh.id])
  })
  test('doneThisShift only contains tasks completed inside the current clock window', () => {
    const inWindow = mk({ status: 'done', doneAt: new Date(2026, 6, 8, 7, 0).toISOString() })
    const before = mk({ status: 'done', doneAt: new Date(2026, 6, 8, 5, 0).toISOString() })
    const brief = buildBrief([inWindow, before], 'frueh', NOW)
    expect(brief.doneThisShift.map((t) => t.id)).toEqual([inWindow.id])
  })
  test('counts open, wichtig, doneThisShift; toShift follows rotation', () => {
    const brief = buildBrief(
      [mk({}), mk({ priority: 'wichtig' }),
       mk({ status: 'done', doneAt: new Date(2026, 6, 8, 7, 0).toISOString() })], 'frueh', NOW)
    expect(brief.counts).toEqual({ open: 2, wichtig: 1, doneThisShift: 1 })
    expect(brief.fromShift).toBe('frueh')
    expect(brief.toShift).toBe('spaet')
  })
})

describe('carriedOverLabel', () => {
  test('empty for tasks created in the current window', () => {
    expect(carriedOverLabel(mk({}), NOW)).toBe('')
  })
  test('labels older tasks with date and shift', () => {
    const t = mk({ createdAt: new Date(2026, 6, 7, 15, 0).toISOString(), createdShift: 'spaet' })
    expect(carriedOverLabel(t, NOW)).toBe('seit 07.07. Spät')
  })
})

describe('formatBriefText', () => {
  test('produces the exact handover text format', () => {
    const tasks = [
      mk({ text: 'Wasserkocher defekt, Technik informiert', ref: '204', priority: 'wichtig' }),
      mk({ text: 'Anreise ca. 23 Uhr, Schlüssel hinterlegt', ref: '117',
           createdAt: new Date(2026, 6, 7, 15, 0).toISOString(), createdShift: 'spaet' }),
      mk({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' }),
      mk({ text: 'Taxi 06:30 bestellt', ref: '118', status: 'done',
           doneAt: new Date(2026, 6, 8, 6, 30).toISOString() }),
    ]
    expect(formatBriefText(buildBrief(tasks, 'frueh', NOW))).toBe(
      [
        'ÜBERGABE Früh → Spät · Mi, 08.07.2026 · 13:58',
        '',
        'OFFEN (3)',
        '',
        'Front Office',
        '  ! 204 — Wasserkocher defekt, Technik informiert',
        '  · 117 — Anreise ca. 23 Uhr, Schlüssel hinterlegt (seit 07.07. Spät)',
        '',
        'Housekeeping',
        '  · 310 — Extra Kissen gewünscht',
        '',
        'ERLEDIGT DIESE SCHICHT (1)',
        '  · 118 — Taxi 06:30 bestellt',
      ].join('\n'),
    )
  })
  test('all-clear brief says so', () => {
    expect(formatBriefText(buildBrief([], 'nacht', NOW))).toContain('Keine offenen Aufgaben. Gute Übergabe!')
  })
})

describe('briefFilename', () => {
  test('is date- and shift-stamped', () => {
    expect(briefFilename(buildBrief([], 'frueh', NOW))).toBe('uebergabe-2026-07-08-frueh.txt')
  })
})
