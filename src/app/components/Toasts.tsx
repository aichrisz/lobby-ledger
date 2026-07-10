import { useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { LedgerApp } from '../state'
import { updateReady } from '../sw-register'

export function Banner({ children, tone = 'info', onClose }: {
  children: ComponentChildren
  tone?: 'info' | 'warn'
  onClose?: () => void
}) {
  return (
    <div class={`banner banner-${tone} no-print`} role="status">
      <p>{children}</p>
      {onClose && <button onClick={onClose} aria-label="Hinweis schließen">OK</button>}
    </div>
  )
}

export function UpdateBar() {
  const apply = updateReady.value
  if (!apply) return null
  return (
    <div class="banner no-print" role="status">
      <p>Neue Version verfügbar.</p>
      <button onClick={apply}>Aktualisieren</button>
    </div>
  )
}

export function UndoToast({ app }: { app: LedgerApp }) {
  const deleted = app.lastDeleted.value
  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => (app.lastDeleted.value = null), 6000)
    return () => clearTimeout(timer)
  }, [deleted, app])
  if (!deleted) return null
  return (
    <div class="toast no-print" role="status">
      Aufgabe gelöscht.
      <button onClick={() => app.undoRemove()}>Rückgängig</button>
    </div>
  )
}
