import { describe, expect, test } from 'vitest'
import { mapDbError } from './errors'

describe('mapDbError', () => {
  test.each([
    ['P0403', 'forbidden'],
    ['P0404', 'not-found'],
    ['P0409', 'conflict'],
    ['P0422', 'validation'],
    ['23514', 'validation'],
    ['23505', 'validation'],
  ] as const)('%s → %s', (code, kind) => {
    expect(mapDbError({ code, message: 'x' }).kind).toBe(kind)
  })
  test('fetch failure → network', () => {
    expect(mapDbError({ message: 'TypeError: Failed to fetch' }).kind).toBe('network')
  })
  test('anything else → unknown', () => {
    expect(mapDbError({ code: 'XX000', message: 'boom' }).kind).toBe('unknown')
  })
})
