import { describe, expect, test } from 'vitest'
import {
  addDays, formatServiceDate, nextTargetContext, serviceContext,
} from './berlin'

const at = (iso: string) => new Date(iso)

describe('serviceContext (CEST, UTC+2 in July)', () => {
  test.each([
    ['2026-07-10T04:00:00Z', { serviceDate: '2026-07-10', shift: 'frueh' }],  // 06:00 Berlin
    ['2026-07-10T11:59:00Z', { serviceDate: '2026-07-10', shift: 'frueh' }],  // 13:59
    ['2026-07-10T12:00:00Z', { serviceDate: '2026-07-10', shift: 'spaet' }],  // 14:00
    ['2026-07-10T20:00:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 22:00
    ['2026-07-10T23:30:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 01:30 on the 11th → previous day's Nacht
    ['2026-07-11T03:59:00Z', { serviceDate: '2026-07-10', shift: 'nacht' }],  // 05:59
    ['2026-07-11T04:00:00Z', { serviceDate: '2026-07-11', shift: 'frueh' }],  // 06:00
  ])('%s → %o', (iso, expected) => {
    expect(serviceContext(at(iso))).toEqual(expected)
  })

  test('winter time (CET, UTC+1): 05:30 Berlin on Jan 10 is still Jan 9 Nacht', () => {
    expect(serviceContext(at('2026-01-10T04:30:00Z')))
      .toEqual({ serviceDate: '2026-01-09', shift: 'nacht' })
  })

  test('DST start night (2026-03-29, 02:00→03:00): whole night stays Nacht of the 28th', () => {
    expect(serviceContext(at('2026-03-29T00:30:00Z'))) // 01:30 CET
      .toEqual({ serviceDate: '2026-03-28', shift: 'nacht' })
    expect(serviceContext(at('2026-03-29T01:30:00Z'))) // 03:30 CEST (02:xx never exists)
      .toEqual({ serviceDate: '2026-03-28', shift: 'nacht' })
    expect(serviceContext(at('2026-03-29T04:00:00Z'))) // 06:00 CEST
      .toEqual({ serviceDate: '2026-03-29', shift: 'frueh' })
  })

  test('DST end night (2026-10-25, 03:00→02:00): repeated 02:xx hour stays Nacht of the 24th', () => {
    expect(serviceContext(at('2026-10-25T00:30:00Z'))) // 02:30 CEST (first pass)
      .toEqual({ serviceDate: '2026-10-24', shift: 'nacht' })
    expect(serviceContext(at('2026-10-25T01:30:00Z'))) // 02:30 CET (second pass)
      .toEqual({ serviceDate: '2026-10-24', shift: 'nacht' })
    expect(serviceContext(at('2026-10-25T05:00:00Z'))) // 06:00 CET
      .toEqual({ serviceDate: '2026-10-25', shift: 'frueh' })
  })
})

describe('addDays (pure calendar math, month/year rollover)', () => {
  test.each([
    ['2026-07-10', 1, '2026-07-11'],
    ['2026-07-31', 1, '2026-08-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2026-02-28', 1, '2026-03-01'],
  ])('%s %i → %s', (d, n, out) => expect(addDays(d, n)).toBe(out))
})

describe('nextTargetContext (default receiving context for a source)', () => {
  test('frueh hands to spaet same date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'frueh' }))
      .toEqual({ serviceDate: '2026-07-10', shift: 'spaet' })
  })
  test('spaet hands to nacht same date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'spaet' }))
      .toEqual({ serviceDate: '2026-07-10', shift: 'nacht' })
  })
  test('nacht hands to frueh of the NEXT date', () => {
    expect(nextTargetContext({ serviceDate: '2026-07-10', shift: 'nacht' }))
      .toEqual({ serviceDate: '2026-07-11', shift: 'frueh' })
  })
})

describe('formatServiceDate', () => {
  test('German short weekday + dotted date', () => {
    expect(formatServiceDate('2026-07-08')).toBe('Mi, 08.07.2026')
  })
})
