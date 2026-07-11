import { useEffect, useState } from 'preact/hooks'

const STORAGE_KEY = 'lobby-ledger-pilot-theme'

export function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  }, [dark])

  return (
    <button
      class="theme-toggle"
      type="button"
      aria-label={dark ? 'Helles Layout aktivieren' : 'Dunkles Layout aktivieren'}
      title={dark ? 'Helles Layout' : 'Dunkles Layout'}
      aria-pressed={dark}
      onClick={() => setDark(value => !value)}
    >
      <span aria-hidden="true">{dark ? '☼' : '◐'}</span>
    </button>
  )
}
