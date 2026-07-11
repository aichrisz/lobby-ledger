import { useEffect, useState } from 'preact/hooks'
import { SHIFTS, type Shift } from '../../domain/task'
import { SHIFT_LABELS } from '../../domain/labels'
import { addDays, formatServiceDate, nextTargetContext, serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null; now(): Date }

export function ShiftBoard({ api, signature, now }: Props) {
  const today = serviceContext(now()).serviceDate
  const [date, setDate] = useState(today)
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [needSignature, setNeedSignature] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    void api.boardForDate(date).then((r) => {
      if (!live) return
      if (r.ok) { setRows(r.value); setError('') }
      else setError('Keine Verbindung. Änderung nicht gespeichert.')
    })
    return () => { live = false }
  }, [api, date])

  const begin = async (shift: Shift) => {
    if (!signature) { setNeedSignature(true); return }
    const target = nextTargetContext({ serviceDate: date, shift })
    const res = await api.createOrGetDraft({
      serviceDate: date, sourceShift: shift, sourceDepartment: 'front-office',
      targetShift: target.shift, targetDepartment: 'front-office',
    }, signature.id)
    if (res.ok) location.hash = `#/handover/${res.value.id}`
    else setError('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <section class="board">
      <h1>Übergaben</h1>
      <div class="date-nav">
        <button type="button" aria-label="Vorheriger Tag" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <span class="date-label">{formatServiceDate(date)}</span>
        <button type="button" aria-label="Nächster Tag" onClick={() => setDate(addDays(date, 1))}>›</button>
        {date !== today && <button type="button" onClick={() => setDate(today)}>Heute</button>}
        <label class="visually-hidden" for="board-date">Datum wählen</label>
        <input id="board-date" type="date" value={date}
               onChange={(e) => setDate((e.currentTarget as HTMLInputElement).value || today)} />
      </div>
      {needSignature && <p class="hint" role="status">Wer arbeitet gerade? Kürzel wählen oder anlegen.</p>}
      {error && <p class="hint" role="status">{error}</p>}
      <div class="shift-columns">
        {SHIFTS.map((shift) => {
          const mine = rows.filter((h) => h.source_shift === shift)
          return (
            <section class="shift-col" key={shift}>
              <h2>{SHIFT_LABELS[shift]}</h2>
              {mine.length === 0 && <p class="empty">Noch keine Übergabe.</p>}
              <ul>
                {mine.map((h) => (
                  <li key={h.id}>
                    <a href={`#/handover/${h.id}`}>
                      → {SHIFT_LABELS[h.target_shift]} · <span class="status" data-status={h.status}>{HANDOVER_STATUS_LABELS[h.status]}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void begin(shift)}>Übergabe beginnen</button>
            </section>
          )
        })}
      </div>
    </section>
  )
}
