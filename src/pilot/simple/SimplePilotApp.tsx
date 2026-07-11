import type { StorageLike } from '../../storage/store'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  UnauthorizedError, type LedgerApi, type LedgerDepartment, type LedgerPriority,
  type LedgerShift, type LedgerTask,
} from './api'
import { buildBrief } from './brief'
import { cycleThemePreference, resolveTheme, type ThemePreference } from './theme'

export interface SimplePilotDeps {
  api: LedgerApi
  storage: StorageLike
  now(): Date
  print(): void
  copy(text: string): Promise<void>
  download(text: string, filename: string): void
}

const INITIALS_KEY = 'lobby-ledger:initials'
const THEME_KEY = 'lobby-ledger:simple-theme'
const SHIFTS: LedgerShift[] = ['frueh', 'spaet', 'nacht']
const SHIFT_LABELS: Record<LedgerShift, string> = { frueh: 'Früh', spaet: 'Spät', nacht: 'Nacht' }
const DEPARTMENTS: Array<[LedgerDepartment, string]> = [
  ['front-office', 'Front Office'], ['housekeeping', 'Housekeeping'], ['restaurant', 'Restaurant'],
]
const THEME_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Hell', dark: 'Dunkel' }

function storedThemePreference(storage: StorageLike): ThemePreference {
  const preference = storage.getItem(THEME_KEY)
  return preference === 'light' || preference === 'dark' || preference === 'system' ? preference : 'system'
}

function systemPrefersDark(): boolean {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-color-scheme: dark)').matches
}

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

function shiftFor(date: Date): LedgerShift {
  const hour = date.getHours()
  return hour >= 6 && hour < 14 ? 'frueh' : hour >= 14 && hour < 22 ? 'spaet' : 'nacht'
}

export function SimplePilotApp({ deps }: { deps: SimplePilotDeps }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [date, setDate] = useState(() => isoDate(deps.now()))
  const [shift, setShift] = useState<LedgerShift>(() => shiftFor(deps.now()))
  const [initials, setInitials] = useState(() => (deps.storage.getItem(INITIALS_KEY) ?? '').toUpperCase())
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => storedThemePreference(deps.storage))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)
  const [tasks, setTasks] = useState<LedgerTask[]>([])
  const [text, setText] = useState('')
  const [ref, setRef] = useState('')
  const [department, setDepartment] = useState<LedgerDepartment>('front-office')
  const [priority, setPriority] = useState<LedgerPriority>('normal')
  const [captureExpanded, setCaptureExpanded] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [message, setMessage] = useState('')
  const loadSequence = useRef(0)
  const priorDocumentTheme = useRef<string | null | undefined>(undefined)
  const validInitials = /^[A-Z]{2,4}$/.test(initials)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (priorDocumentTheme.current === undefined) {
      priorDocumentTheme.current = root.getAttribute('data-theme')
    }
    root.dataset.theme = resolveTheme(themePreference, systemDark)
    return () => {
      if (priorDocumentTheme.current === null) delete root.dataset.theme
      else if (priorDocumentTheme.current !== undefined) root.dataset.theme = priorDocumentTheme.current
    }
  }, [systemDark, themePreference])

  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return
    const media = globalThis.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      if (themePreference === 'system') setSystemDark(event.matches)
    }
    if (themePreference === 'system') setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [themePreference])

  const changeThemePreference = () => {
    const next = cycleThemePreference(themePreference)
    setThemePreference(next)
    deps.storage.setItem(THEME_KEY, next)
  }

  const load = async (serviceDate: string, sourceShift = shift) => {
    const sequence = ++loadSequence.current
    setTasks([])
    try {
      const loaded = await deps.api.list(serviceDate, sourceShift)
      if (sequence !== loadSequence.current) return
      setTasks(loaded)
      setAuthenticated(true)
      setMessage('')
    } catch (error) {
      if (sequence !== loadSequence.current) return
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage('Laden fehlgeschlagen. Bitte erneut versuchen.')
    }
  }

  useEffect(() => { if (authenticated) void load(date, shift) }, [date, shift])

  const unlock = async (event: Event) => {
    event.preventDefault()
    try {
      await deps.api.unlock(pin)
      setPin('')
      await load(date, shift)
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
      const created = await deps.api.create(date, shift, initials, {
        text: trimmed, ref: ref.trim(), department, priority,
      })
      setTasks((current) => [...current, created])
      setText('')
      setRef('')
      setPriority('normal')
      setMessage('Gespeichert.')
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage(error instanceof Error ? error.message : 'Speichern fehlgeschlagen.')
    }
  }

  const setStatus = async (item: LedgerTask) => {
    if (!validInitials) { setMessage('Bitte zuerst Kürzel eingeben.'); return }
    try {
      const updated = await deps.api.setStatus(item.id, date, shift, initials, item.status === 'open' ? 'done' : 'open')
      setTasks((current) => current.map((task) => task.id === updated.id ? updated : task))
    } catch (error) {
      if (error instanceof UnauthorizedError) setAuthenticated(false)
      else setMessage('Status konnte nicht gespeichert werden.')
    }
  }

  const remove = async (item: LedgerTask) => {
    if (!validInitials) { setMessage('Bitte zuerst Kürzel eingeben.'); return }
    try {
      await deps.api.delete(item.id, date, shift, initials)
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

  const openTasks = tasks.filter((task) => task.status === 'open')
    .sort((a, b) => a.priority === b.priority ? b.createdAt.localeCompare(a.createdAt) : a.priority === 'wichtig' ? -1 : 1)
  const doneTasks = tasks.filter((task) => task.status === 'done')
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  const brief = buildBrief(date, shift, initials, tasks)
  return <div class="simple-ledger">
    <header>
      <div class="header-row"><span class="wordmark">Lobby Ledger</span><div class="header-actions"><span class="open-count">{openTasks.length} offen</span>
        <button class="theme-control" type="button" aria-pressed={resolveTheme(themePreference, systemDark) === 'dark'} onClick={changeThemePreference}>
          Darstellung: {THEME_LABELS[themePreference]}
        </button>
      </div></div>
      <fieldset class="shift-control">
        <legend class="visually-hidden">Aktuelle Schicht</legend>
        {SHIFTS.map((item) => <label class={`shift-option${shift === item ? ' on' : ''}`} key={item}>
          <input type="radio" name="shift" value={item} checked={shift === item} onChange={() => setShift(item)} />
          <span>{SHIFT_LABELS[item]}</span>
        </label>)}
      </fieldset>
      <div class="ledger-controls">
        <div class="date-control">
          <label for="service-date">Datum</label>
          <button type="button" aria-label="Vorheriger Tag" onClick={() => setDate(moveDate(date, -1))}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <input id="service-date" type="date" value={date} onInput={(event) => setDate(event.currentTarget.value)} />
          <button type="button" aria-label="Nächster Tag" onClick={() => setDate(moveDate(date, 1))}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
          </button>
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
          {openTasks.map((item) => <li key={item.id} data-status={item.status} class={item.priority === 'wichtig' ? 'wichtig' : ''}>
            <button class="status-button" type="button" aria-label={item.status === 'open' ? 'Als erledigt markieren' : 'Wieder öffnen'}
              onClick={() => void setStatus(item)}>{item.status === 'done' ? '✓' : '○'}</button>
            <div class="task-main"><p>{item.ref && <strong class="nums">{item.ref}</strong>} {item.text}</p>
              <small>{DEPARTMENTS.find(([key]) => key === item.department)?.[1]}{item.priority === 'wichtig' && ' · Wichtig'}</small></div>
            <button class="delete-button" type="button" aria-label="Aufgabe löschen" onClick={() => void remove(item)}>Löschen</button>
          </li>)}
          {tasks.length === 0 && <li class="empty">Noch keine Aufgaben für diesen Tag.</li>}
        </ul>
        {doneTasks.length > 0 && <div class="done-section">
          <button class="done-toggle" type="button" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>Erledigt ({doneTasks.length})</button>
          {showDone && <ul class="simple-tasks is-done">{doneTasks.map((item) => <li key={item.id} data-status="done">
            <button class="status-button" type="button" aria-label="Wieder öffnen" onClick={() => void setStatus(item)}>✓</button>
            <div class="task-main"><p>{item.ref && <strong class="nums">{item.ref}</strong>} {item.text}</p>
              <small>{DEPARTMENTS.find(([key]) => key === item.department)?.[1]}</small></div>
            <button class="delete-button" type="button" aria-label="Aufgabe löschen" onClick={() => void remove(item)}>Löschen</button>
          </li>)}</ul>}
        </div>}
      </section>

      <form class="simple-capture" onSubmit={capture}>
        <label class="visually-hidden" for="task-text">Neue Aufgabe, keine Gastnamen</label>
        <div class="capture-row">
          <input id="task-text" maxlength={200} value={text} placeholder="Neue Aufgabe … (keine Gastnamen)"
            onFocus={() => setCaptureExpanded(true)} onInput={(event) => setText(event.currentTarget.value)} />
          <button type="submit" disabled={!validInitials || !text.trim()}>Erfassen</button>
        </div>
        {captureExpanded && <div class="capture-details">
          <input aria-label="Zimmer oder Referenz" maxlength={24} value={ref} placeholder="Zimmer / Ref."
            onInput={(event) => setRef(event.currentTarget.value)} />
          <fieldset class="department-chips"><legend class="visually-hidden">Abteilung</legend>
            {DEPARTMENTS.map(([key, label]) => <label class={department === key ? 'on' : ''} key={key}>
              <input type="radio" name="department" value={key} checked={department === key} onChange={() => setDepartment(key)} />
              <span>{label}</span>
            </label>)}
          </fieldset>
          <label class="priority-toggle"><input type="checkbox" checked={priority === 'wichtig'}
            onChange={(event) => setPriority(event.currentTarget.checked ? 'wichtig' : 'normal')} /> Wichtig</label>
          <p>Keine Gastnamen oder Kontaktdaten – nur Zimmer und Sache.</p>
        </div>}
        {!validInitials && <small>Kürzel mit 2–4 Buchstaben eingeben.</small>}
      </form>

      <section class="simple-handover">
        <div><p class="eyebrow">Übergabe</p><h2>{date.split('-').reverse().join('.')} · {SHIFT_LABELS[shift]} · {initials || '—'}</h2></div>
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
