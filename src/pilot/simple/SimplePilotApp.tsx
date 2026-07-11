import type { StorageLike } from '../../storage/store'
import { useEffect, useState } from 'preact/hooks'
import { UnauthorizedError, type LedgerApi, type LedgerTask } from './api'
import { buildBrief } from './brief'

export interface SimplePilotDeps {
  api: LedgerApi
  storage: StorageLike
  now(): Date
  print(): void
  copy(text: string): Promise<void>
  download(text: string, filename: string): void
}

const INITIALS_KEY = 'lobby-ledger:initials'

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function moveDate(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return isoDate(date)
}

export function SimplePilotApp({ deps }: { deps: SimplePilotDeps }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [date, setDate] = useState(() => isoDate(deps.now()))
  const [initials, setInitials] = useState(() => (deps.storage.getItem(INITIALS_KEY) ?? '').toUpperCase())
  const [tasks, setTasks] = useState<LedgerTask[]>([])
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const validInitials = /^[A-Z]{2,4}$/.test(initials)

  const load = async (serviceDate: string) => {
    try {
      setTasks(await deps.api.list(serviceDate))
      setAuthenticated(true)
      setMessage('')
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage('Laden fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  useEffect(() => { if (authenticated) void load(date) }, [date])

  const unlock = async (event: Event) => {
    event.preventDefault()
    try {
      await deps.api.unlock(pin)
      setPin('')
      await load(date)
    } catch {
      setMessage('PIN ungültig.')
    }
  }

  const changeInitials = (value: string) => {
    const next = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
    setInitials(next)
    if (/^[A-Z]{2,4}$/.test(next)) deps.storage.setItem(INITIALS_KEY, next)
  }

  const capture = async (event: Event) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!validInitials || !trimmed) return
    try {
      const created = await deps.api.create(date, initials, trimmed)
      setTasks((current) => [...current, created])
      setText('')
      setMessage('Gespeichert.')
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.')
    }
  }

  const setStatus = async (item: LedgerTask) => {
    if (!validInitials) { setMessage('Bitte zuerst Kürzel eingeben.'); return }
    try {
      const updated = await deps.api.setStatus(item.id, date, initials, item.status === 'open' ? 'done' : 'open')
      setTasks((current) => current.map((task) => task.id === updated.id ? updated : task))
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage('Status konnte nicht gespeichert werden.')
    }
  }

  const remove = async (item: LedgerTask) => {
    if (!validInitials) { setMessage('Bitte zuerst Kürzel eingeben.'); return }
    try {
      await deps.api.delete(item.id, date, initials)
      setTasks((current) => current.filter((task) => task.id !== item.id))
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage('Löschen fehlgeschlagen.')
    }
  }

  if (!authenticated) {
    return <main class="pin-page">
      <section class="pin-sheet">
        <p class="eyebrow">Rezeption</p>
        <h1>Lobby Ledger</h1>
        <p>Bitte PIN eingeben.</p>
        <form onSubmit={unlock}>
          <label for="pilot-pin">PIN</label>
          <input id="pilot-pin" type="password" inputMode="numeric" autocomplete="current-password"
            value={pin} onInput={(event) => setPin(event.currentTarget.value)} />
          <button type="submit">Öffnen</button>
        </form>
        {message && <p role="status" class="form-message">{message}</p>}
      </section>
    </main>
  }

  const brief = buildBrief(date, initials, tasks)
  return <div class="simple-ledger">
    <header>
      <span class="wordmark">Lobby Ledger</span>
      <div class="ledger-controls">
        <div class="date-control">
          <button type="button" aria-label="Vorheriger Tag" onClick={() => setDate(moveDate(date, -1))}>‹</button>
          <label for="service-date">Datum</label>
          <input id="service-date" type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />
          <button type="button" aria-label="Nächster Tag" onClick={() => setDate(moveDate(date, 1))}>›</button>
        </div>
        <label class="initials-field" for="initials">Kürzel
          <input id="initials" value={initials} minlength={2} maxlength={4} autocomplete="off" placeholder="AB"
            onInput={(event) => changeInitials(event.currentTarget.value)} />
        </label>
      </div>
    </header>

    <main>
      <section class="tasks-section">
        <h1>Aufgaben</h1>
        <ul class="simple-tasks">
          {tasks.map((item) => <li key={item.id} data-status={item.status}>
            <button class="status-button" type="button" aria-label={item.status === 'open' ? 'Als erledigt markieren' : 'Wieder öffnen'}
              onClick={() => void setStatus(item)}>{item.status === 'done' ? '✓' : '○'}</button>
            <span>{item.text}</span>
            <button class="delete-button" type="button" aria-label="Aufgabe löschen" onClick={() => void remove(item)}>Löschen</button>
          </li>)}
          {tasks.length === 0 && <li class="empty">Noch keine Aufgaben für diesen Tag.</li>}
        </ul>
      </section>

      <form class="simple-capture" onSubmit={capture}>
        <label for="task-text">Aufgabe erfassen</label>
        <div>
          <input id="task-text" maxlength={200} value={text} placeholder="Neue Aufgabe … (keine Gastnamen)"
            onInput={(event) => setText(event.currentTarget.value)} />
          <button type="submit" disabled={!validInitials || !text.trim()}>Erfassen</button>
        </div>
        {!validInitials && <small>Kürzel mit 2–4 Buchstaben eingeben.</small>}
      </form>

      <section class="simple-handover">
        <div><p class="eyebrow">Übergabe</p><h2>{date.split('-').reverse().join('.')} · {initials || '—'}</h2></div>
        <div class="handover-actions">
          <button type="button" onClick={deps.print}>Drucken</button>
          <button type="button" onClick={() => void deps.copy(brief).then(() => setMessage('Kopiert.'))}>Kopieren</button>
          <button type="button" onClick={() => deps.download(brief, `lobby-ledger-${date}-${initials || 'ohne-kuerzel'}.txt`)}>Als .txt</button>
        </div>
      </section>
      {message && <p role="status" class="form-message">{message}</p>}
    </main>
  </div>
}
