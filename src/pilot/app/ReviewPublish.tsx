import { useState } from 'preact/hooks'
import type { HandoverRow, PilotApi, SignatureRow } from '../api/rpc'

interface TaskSummary { status: string; priority: string; carry_over_from_task_id: string | null }
interface Props {
  api: PilotApi
  signature: SignatureRow | null
  handover: HandoverRow
  tasks: TaskSummary[]
  onChanged(h: HandoverRow): void
}

export function ReviewPublish({ api, signature, handover, tasks, onChanged }: Props) {
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  if (handover.status !== 'draft') {
    return handover.published_at
      ? <p class="publish-stamp">Veröffentlicht um {new Date(handover.published_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
      : null
  }
  const open = tasks.filter((t) => t.status === 'open').length
  const wichtig = tasks.filter((t) => t.status === 'open' && t.priority === 'wichtig').length
  const carried = tasks.filter((t) => t.carry_over_from_task_id !== null).length

  const publish = async () => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    setPending(true)
    setHint('')
    const res = await api.publishHandover(handover.id, signature.id, handover.version)
    setPending(false)
    if (res.ok) onChanged(res.value)
    else setHint(res.error.kind === 'conflict'
      ? 'Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.'
      : 'Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <div class="review">
      <p class="nums">Offen: {open} · Wichtig: {wichtig} · Übertragen: {carried}</p>
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => void publish()}>
        {pending ? '…' : 'Übergabe veröffentlichen'}
      </button>
      {hint && <p class="hint" role="status">{hint}</p>}
    </div>
  )
}
