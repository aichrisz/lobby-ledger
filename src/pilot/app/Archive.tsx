import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { formatServiceDate, serviceContext } from '../domain/berlin'
import { HANDOVER_STATUS_LABELS } from '../domain/labels'
import { copyText } from '../../app/export'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface Props { api: PilotApi; signature: SignatureRow | null }
interface PilotMetrics {
  handovers: number
  published: number
  acknowledged: number
  tasks: number
  carried_over: number
  template_usage: Record<string, number>
}

export function Archive({ api, signature }: Props) {
  const [rows, setRows] = useState<HandoverRow[]>([])
  const [copied, setCopied] = useState(false)
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    void api.searchArchive({}).then((r) => { if (r.ok) setRows(r.value) })
  }, [api])

  const copyMetrics = async () => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const to = serviceContext(new Date()).serviceDate
    const from = `${to.slice(0, 8)}01`
    setPending(true)
    setHint('')
    const res = await api.pilotMetrics(signature.id, from, to)
    if (!res.ok) {
      setPending(false)
      setHint('Keine Verbindung. Kennzahlen nicht kopiert.')
      return
    }
    const m = res.value as unknown as PilotMetrics
    const ok = await copyText(
      [`PILOT-KENNZAHLEN ${from} – ${to}`,
       `Übergaben: ${m.handovers} · veröffentlicht: ${m.published} · übernommen: ${m.acknowledged}`,
       `Aufgaben: ${m.tasks} · übertragen: ${m.carried_over}`,
       `Vorlagen: ${JSON.stringify(m.template_usage)}`].join('\n'))
    setPending(false)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      setHint('Kopieren nicht möglich. Browser-Berechtigung prüfen.')
    }
  }

  return (
    <section class="archive">
      <h1>Archiv</h1>
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => void copyMetrics()}>
        {pending ? '…' : copied ? 'Kopiert ✓' : 'Pilot-Kennzahlen kopieren'}
      </button>
      {hint && <p class="hint" role="status">{hint}</p>}
      <ul class="task-list">
        {rows.map((h) => (
          <li key={h.id} class="task-row">
            <a href={`#/handover/${h.id}`}>
              {formatServiceDate(h.service_date)} · {SHIFT_LABELS[h.source_shift]} {DEPARTMENT_LABELS[h.source_department]} → {SHIFT_LABELS[h.target_shift]} · {HANDOVER_STATUS_LABELS[h.status]}
            </a>
          </li>
        ))}
        {rows.length === 0 && <li class="empty">Noch keine archivierten Übergaben.</li>}
      </ul>
    </section>
  )
}
