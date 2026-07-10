import { describe, expect, test } from 'vitest'
import { maskContact, maskName, retentionExpiry, RETENTION_DAYS } from './privacy'

describe('maskName', () => {
  test('initials with dots', () => {
    expect(maskName('Anna Schmidt')).toBe('A. S.')
    expect(maskName('  anna  ')).toBe('A.')
  })
})

describe('maskContact', () => {
  test('phone keeps last two digits', () => {
    expect(maskContact('phone', '+49 171 2345678')).toBe('••• 78')
  })
  test('email keeps first character only', () => {
    expect(maskContact('email', 'anna@web.de')).toBe('a•••')
  })
})

describe('retentionExpiry', () => {
  test(`is completion + ${RETENTION_DAYS} days`, () => {
    expect(retentionExpiry('2026-07-10T14:00:00.000Z')).toBe('2026-08-09T14:00:00.000Z')
  })
})
