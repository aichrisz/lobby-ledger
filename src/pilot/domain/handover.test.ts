import { describe, expect, test } from 'vitest'
import { canTransition, isValidTuple, tupleKey } from './handover'

describe('canTransition', () => {
  test.each([
    ['draft', 'published', true],
    ['published', 'acknowledged', true],
    ['draft', 'acknowledged', false],
    ['published', 'draft', false],
    ['acknowledged', 'published', false],
    ['acknowledged', 'acknowledged', false],
  ] as const)('%s → %s = %s', (from, to, ok) => {
    expect(canTransition(from, to)).toBe(ok)
  })
})

describe('isValidTuple', () => {
  const base = {
    serviceDate: '2026-07-10',
    sourceShift: 'frueh', sourceDepartment: 'front-office',
    targetShift: 'spaet', targetDepartment: 'front-office',
  } as const
  test('normal shift-to-next-shift same department is valid', () => {
    expect(isValidTuple(base)).toBe(true)
  })
  test('cross-department same shift is valid', () => {
    expect(isValidTuple({ ...base, targetShift: 'frueh', targetDepartment: 'housekeeping' })).toBe(true)
  })
  test('identical shift AND department is not a handover', () => {
    expect(isValidTuple({ ...base, targetShift: 'frueh' })).toBe(false)
  })
})

describe('tupleKey', () => {
  test('stable key for board grouping', () => {
    expect(tupleKey({
      serviceDate: '2026-07-10',
      sourceShift: 'frueh', sourceDepartment: 'front-office',
      targetShift: 'spaet', targetDepartment: 'front-office',
    })).toBe('2026-07-10|frueh|front-office|spaet|front-office')
  })
})
