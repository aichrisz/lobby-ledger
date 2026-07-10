import { describe, expect, test } from 'vitest'
import { nextShift, resolveShift, shiftForTime, shiftWindowStart } from './shift'

const at = (h: number, m = 0, day = 10) => new Date(2026, 6, day, h, m)

describe('shiftForTime boundaries', () => {
  test.each([
    [at(5, 59), 'nacht'], [at(6, 0), 'frueh'], [at(13, 59), 'frueh'],
    [at(14, 0), 'spaet'], [at(21, 59), 'spaet'], [at(22, 0), 'nacht'], [at(0, 30), 'nacht'],
  ])('%s → %s', (d, s) => expect(shiftForTime(d)).toBe(s))
})

describe('shiftWindowStart', () => {
  test('frueh window starts 06:00 same day', () => {
    expect(shiftWindowStart(at(9, 30))).toEqual(at(6, 0))
  })
  test('nacht after midnight started 22:00 the previous day', () => {
    expect(shiftWindowStart(at(1, 15))).toEqual(new Date(2026, 6, 9, 22, 0))
  })
  test('nacht before midnight started 22:00 same day', () => {
    expect(shiftWindowStart(at(23, 0))).toEqual(at(22, 0))
  })
})

describe('resolveShift with override', () => {
  test('no override → clock shift', () => {
    expect(resolveShift(at(10, 0), null)).toBe('frueh')
  })
  test('override set within current window wins', () => {
    expect(resolveShift(at(13, 30), { shift: 'spaet', setAt: at(13, 0).toISOString() })).toBe('spaet')
  })
  test('override expires at the next shift boundary', () => {
    expect(resolveShift(at(14, 5), { shift: 'frueh', setAt: at(13, 0).toISOString() })).toBe('spaet')
  })
  test('nacht override set at 23:00 still valid at 01:00 (spans midnight)', () => {
    expect(resolveShift(at(1, 0, 11), { shift: 'spaet', setAt: at(23, 0, 10).toISOString() })).toBe('spaet')
  })
  test('stale override from yesterday is ignored', () => {
    expect(resolveShift(at(6, 30, 11), { shift: 'spaet', setAt: at(23, 0, 10).toISOString() })).toBe('frueh')
  })
  test('garbage setAt is ignored', () => {
    expect(resolveShift(at(10, 0), { shift: 'nacht', setAt: 'not-a-date' })).toBe('frueh')
  })
})

describe('nextShift', () => {
  test.each([['frueh', 'spaet'], ['spaet', 'nacht'], ['nacht', 'frueh']] as const)(
    '%s → %s', (a, b) => expect(nextShift(a)).toBe(b))
})
