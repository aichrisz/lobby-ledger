export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = Exclude<ThemePreference, 'system'>

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemDark ? 'dark' : 'light'
  }

  return preference
}

export function cycleThemePreference(
  preference: ThemePreference,
): ThemePreference {
  switch (preference) {
    case 'system':
      return 'dark'
    case 'dark':
      return 'light'
    case 'light':
      return 'system'
  }
}

export function clearThemePreference(
  _preference: ThemePreference,
): ThemePreference {
  return 'system'
}
