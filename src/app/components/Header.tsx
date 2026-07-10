import type { LedgerApp } from '../state'
import type { Route } from '../router'
import { SHIFTS } from '../../domain/task'
import { SHIFT_LABELS } from '../../domain/labels'

export function Header({ app, route }: { app: LedgerApp; route: Route }) {
  const openCount = app.tasks.value.filter((t) => t.status === 'open').length
  return (
    <header class="header no-print">
      <div class="header-row">
        <span class="wordmark">Lobby Ledger</span>
        {route === 'tasks' ? (
          <a class="brief-link" href="#/uebergabe">
            Übergabe
            {openCount > 0 && (
              <span class="count nums" aria-label={`${openCount} offene Aufgaben`}>{openCount}</span>
            )}
          </a>
        ) : (
          <a class="brief-link" href="#/">Zurück</a>
        )}
      </div>
      <ShiftControl app={app} />
    </header>
  )
}

function ShiftControl({ app }: { app: LedgerApp }) {
  return (
    <fieldset class="shift-control">
      <legend class="visually-hidden">Aktuelle Schicht</legend>
      {SHIFTS.map((s) => (
        <label key={s} class={`shift-option${app.shift.value === s ? ' on' : ''}`}>
          <input
            type="radio" name="shift" value={s}
            checked={app.shift.value === s}
            onChange={() => app.setShift(s)}
          />
          <span>{SHIFT_LABELS[s]}</span>
        </label>
      ))}
    </fieldset>
  )
}
