import { describe, expect, test } from 'vitest'
import { parseCreateTask, parseLedgerDate, parseTaskPatch } from './validation'

describe('ledger API validation', () => {
  test('accepts only real ISO service dates', () => {
    expect(parseLedgerDate('2026-07-11')).toBe('2026-07-11')
    expect(() => parseLedgerDate('2026-02-30')).toThrow('service date')
    expect(() => parseLedgerDate(['2026-07-11'])).toThrow('service date')
  })

  test('normalizes valid Kürzel and rejects non-ASCII or long values', () => {
    expect(parseCreateTask({
      date: '2026-07-11', shift: 'spaet', initials: ' ab ', text: '  Schlüssel prüfen  ',
      ref: ' 204 ', department: 'housekeeping', priority: 'wichtig',
    })).toEqual({
      date: '2026-07-11', shift: 'spaet', initials: 'AB', text: 'Schlüssel prüfen',
      ref: '204', department: 'housekeeping', priority: 'wichtig',
    })
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'spaet', initials: 'A', text: 'Test' })).toThrow('Kürzel')
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'spaet', initials: 'ÄB', text: 'Test' })).toThrow('Kürzel')
  })

  test('applies V1 task defaults and validates task metadata', () => {
    expect(parseCreateTask({ date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Test' }))
      .toMatchObject({ ref: '', department: 'front-office', priority: 'normal' })
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Test', ref: 'x'.repeat(25) }))
      .toThrow('Referenz')
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Test', department: 'technik' }))
      .toThrow('Abteilung')
  })

  test('requires one of the three source shifts', () => {
    expect(() => parseCreateTask({ date: '2026-07-11', initials: 'AB', text: 'Test' })).toThrow('Schicht')
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'mittag', initials: 'AB', text: 'Test' })).toThrow('Schicht')
  })

  test('rejects contact-like task content and unexpected patch fields', () => {
    expect(() => parseCreateTask({ date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'mail@example.test' }))
      .toThrow('Kontaktdaten')
    expect(parseTaskPatch({ date: '2026-07-11', shift: 'nacht', initials: 'AB', status: 'done' }))
      .toEqual({ date: '2026-07-11', shift: 'nacht', initials: 'AB', status: 'done' })
    expect(() => parseTaskPatch({ date: '2026-07-11', shift: 'nacht', initials: 'AB', status: 'done', organizationId: 'x' }))
      .toThrow('fields')
  })
})
