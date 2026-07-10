import { useEffect } from 'preact/hooks'
import type { LedgerApp } from '../state'
import { useRoute } from '../router'
import { Header } from './Header'
import { Banner, UndoToast } from './Toasts'

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
          ? <h1 class="view-title">Übergabe</h1> /* Task 11 replaces with <BriefView app={app} /> */
          : <h1 class="visually-hidden">Aufgaben</h1> /* Task 10 replaces with <TasksView app={app} /> */}
      </main>
      <UndoToast app={app} />
    </div>
  )
}
