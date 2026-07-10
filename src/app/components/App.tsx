import { useEffect } from 'preact/hooks'
import type { LedgerApp } from '../state'
import { useRoute } from '../router'
import { themeFor } from '../theme'
import { Header } from './Header'
import { Banner, UndoToast } from './Toasts'
import { CaptureBar } from './CaptureBar'
import { TasksView } from './TasksView'
import { BriefView } from './BriefView'

export function App({ app }: { app: LedgerApp }) {
  const route = useRoute()
  useEffect(() => {
    const refresh = () => app.refreshShift()
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(timer)
    }
  }, [app])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const theme = themeFor(app.shift.value, media.matches)
      document.documentElement.dataset.theme = theme
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#191813' : '#F6F3EC')
    }
    media.addEventListener('change', apply)
    const unsubscribe = app.shift.subscribe(apply) // fires immediately with current value
    return () => {
      media.removeEventListener('change', apply)
      unsubscribe()
    }
  }, [app])
  return (
    <div class="app">
      <Header app={app} route={route} />
      {app.recovered.value && (
        <Banner onClose={() => (app.recovered.value = false)}>
          Gespeicherte Daten waren beschädigt. Die App wurde zurückgesetzt; eine Kopie liegt intern vor.
        </Banner>
      )}
      {app.saveFailed.value && (
        <Banner tone="warn">Speichern fehlgeschlagen. Letzte Änderung ist evtl. nicht gesichert.</Banner>
      )}
      <main>
        {route === 'brief'
          ? <BriefView app={app} />
          : <TasksView app={app} />}
      </main>
      {route === 'tasks' && <CaptureBar app={app} />}
      <UndoToast app={app} />
    </div>
  )
}
