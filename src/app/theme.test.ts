import { describe, expect, test } from 'vitest'
import { themeFor } from './theme'

describe('themeFor', () => {
  test.each([
    ['frueh', false, 'light'], ['spaet', false, 'light'],
    ['nacht', false, 'dark'],  ['frueh', true, 'dark'],
  ] as const)('shift=%s prefersDark=%s → %s', (shift, prefers, want) => {
    expect(themeFor(shift, prefers)).toBe(want)
  })
})
