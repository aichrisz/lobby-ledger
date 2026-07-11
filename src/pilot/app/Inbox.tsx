import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null; now(): Date }

export function Inbox({ api, signature, now }: Props) {
  const ctx = serviceContext(now())
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [hint, setHint] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = () => void api.boardForDate(ctx.serviceDate).then((r) => {
    if (r.ok) setRows(r.value.filter((h) => h.target_shift === ctx.shift && h.status !== 'draft'))
  })
  useEffect(load, [api, ctx.serviceDate, ctx.shift])

  const acknowledge = async (h: HandoverRow) => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    setPendingId(h.id)
    setHint('')
    const res = await api.acknowledgeHandover(h.id, signature.id)
    setPendingId(null)
    if (res.ok) setRows((prev) => prev.map((row) => (row.id === h.id ? res.value : row)))
    else setHint('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <section class="inbox">
      <h1>Eingang · {SHIFT_LABELS[ctx.shift]}</h1>
      {rows.length === 0 && <p class="empty">Keine veröffentlichten Übergaben für diese Schicht.</p>}
      <ul class="task-list">
        {rows.map((h) => (
          <li key={h.id} class="task-row">
            <a href={`#/handover/${h.id}`}>
              {SHIFT_LABELS[h.source_shift]} {DEPARTMENT_LABELS[h.source_department]} → {SHIFT_LABELS[h.target_shift]} {DEPARTMENT_LABELS[h.target_department]}
            </a>
            {h.status === 'published'
              ? <button type="button" disabled={pendingId === h.id} aria-busy={pendingId === h.id}
                        onClick={() => void acknowledge(h)}>
                  {pendingId === h.id ? '…' : 'Übernahme bestätigen'}
                </button>
              : <span class="status" data-status="acknowledged">{HANDOVER_STATUS_LABELS[h.status]}</span>}
          </li>
        ))}
      </ul>
      {hint && <p class="hint" role="status">{hint}</p>}
    </section>
  )
}
