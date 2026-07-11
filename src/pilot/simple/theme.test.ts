import { describe, expect, test } from 'vitest'
import {
  clearThemePreference,
  cycleThemePreference,
  resolveTheme,
  type ThemePreference,
} from './theme'

describe('resolveTheme', () => {
  test.each([
    ['system', false, 'light'],
    ['system', true, 'dark'],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
  ] as const)('resolves %s with systemDark=%s to %s', (preference, systemDark, expected) => {
    expect(resolveTheme(preference, systemDark)).toBe(expected)
  })
})

describe('theme preference controls', () => {
  test.each([
    ['system', 'dark'],
    ['dark', 'light'],
    ['light', 'system'],
  ] as const)('cycles %s to %s', (preference, expected) => {
    expect(cycleThemePreference(preference)).toBe(expected)
  })

  test.each<readonly [ThemePreference]>([['system'], ['light'], ['dark']])(
    'clears %s back to the system preference',
    (preference) => {
      expect(clearThemePreference(preference)).toBe('system')
    },
  )
})
