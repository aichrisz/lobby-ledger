import { describe, expect, test } from 'vitest'
import { parseCreateTask, parseLedgerDate, parseTaskPatch } from './validation'

describe('ledger API validation', () => {
  test('accepts only real ISO service dates', () => {
    expect(parseLedgerDate('2026-07-11')).toBe('2026-07-11')
    expect(() => parseLedgerDate('2026-02-30')).toThrow('service date')
    expect(() => parseLedgerDate(['2026-07-11'])).toThrow('service date')
  })

  test('normalizes valid Kürzel and rejects non-ASCII or long values', () => {
    expect(parseCreateTask({ date: '2026-07-11', initials: ' ab ', text: '  Schlüssel prüfen  ' }))
      .toEqual({ date: '2026-07-11', initials: 'AB', text: 'Schlüssel prüfen' })
    expect(() => parseCreateTask({ date: '2026-07-11', initials: 'A', text: 'Test' })).toThrow('Kürzel')
    expect(() => parseCreateTask({ date: '2026-07-11', initials: 'ÄB', text: 'Test' })).toThrow('Kürzel')
  })

  test('rejects contact-like task content and unexpected patch fields', () => {
    expect(() => parseCreateTask({ date: '2026-07-11', initials: 'AB', text: 'mail@example.test' }))
      .toThrow('Kontaktdaten')
    expect(parseTaskPatch({ date: '2026-07-11', initials: 'AB', status: 'done' }))
      .toEqual({ date: '2026-07-11', initials: 'AB', status: 'done' })
    expect(() => parseTaskPatch({ date: '2026-07-11', initials: 'AB', status: 'done', organizationId: 'x' }))
      .toThrow('fields')
  })
})
