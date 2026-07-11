import { useEffect, useState } from 'preact/hooks'
import type { PilotApi, SignatureRow } from '../api/rpc'

interface Health { last_ran_at: string; last_ok: boolean; last_error: string | null; overdue_cases: number }
interface AuditRow { id: number; action: string; occurred_at: string; entity_type: string; entity_id: string }
interface Props { api: PilotApi; signature: SignatureRow | null }

export function AdminPanel({ api, signature }: Props) {
  const [health, setHealth] = useState<Health | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [signatures, setSignatures] = useState<SignatureRow[]>([])
  const [caseId, setCaseId] = useState('')
  const [armed, setArmed] = useState(false)
  const [pending, setPending] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  const isAdmin = signature?.is_admin === true
  useEffect(() => {
    if (!isAdmin || !signature) return
    void api.retentionHealth(signature.id).then((r) => { if (r.ok && r.value[0]) setHealth(r.value[0]) })
    void api.listAuditEvents(signature.id).then((r) => { if (r.ok) setAudit(r.value as AuditRow[]) })
    void api.listSignatures().then((r) => { if (r.ok) setSignatures(r.value) })
  }, [api, signature, isAdmin])

  if (!isAdmin) return <section class="admin"><p class="hint">Nur für die Pilotleitung (Admin-Kürzel).</p></section>

  const deleteCase = async () => {
    const id = caseId.trim()
    if (!id) { setStatus('Gastfall-ID eingeben.'); return }
    if (!armed) { setArmed(true); setStatus(''); return }
    setPending(true)
    const res = await api.adminDeleteGuestCase(id, signature.id)
    setPending(false)
    setArmed(false)
    setStatus(res.ok ? 'Gastdaten gelöscht.' : 'Löschen fehlgeschlagen – ID prüfen.')
  }

  const deactivate = async (targetId: string) => {
    setDeactivatingId(targetId)
    setStatus('')
    const res = await api.deactivateSignature(signature.id, targetId)
    setDeactivatingId(null)
    if (res.ok) {
      setSignatures((current) => current.map((s) => s.id === targetId ? { ...s, active: false } : s))
    } else {
      setStatus('Deaktivieren fehlgeschlagen.')
    }
  }

  return (
    <section class="admin">
      <h1>Verwaltung</h1>
      <h2>Löschläufe</h2>
      {health ? (
        health.last_ok
          ? <p>Löschlauf zuletzt erfolgreich: {new Date(health.last_ran_at).toLocaleDateString('de-DE')}</p>
          : <div class="hint" role="status">
              <p>Löschlauf fehlgeschlagen – bitte prüfen.</p>
              <p>{health.last_error} · Überfällige Fälle: {health.overdue_cases}</p>
            </div>
      ) : <p class="empty">Noch kein Löschlauf protokolliert.</p>}

      <h2>Gastdaten sofort löschen</h2>
      <label>Gastfall-ID<input class="nums" value={caseId}
             onInput={(e) => { setCaseId((e.currentTarget as HTMLInputElement).value); setArmed(false) }} /></label>
      <button type="button" disabled={pending} aria-busy={pending} onClick={() => void deleteCase()}>
        {pending ? '…' : armed ? 'Wirklich sofort löschen?' : 'Gastdaten sofort löschen'}
      </button>
      {status && <p role="status">{status}</p>}

      <h2>Kürzel</h2>
      <ul class="task-list">
        {signatures.map((s) => (
          <li key={s.id} class="task-row">
            <span class="nums">{s.short_code}</span> <span>{s.display_name}</span> {s.is_admin && <span class="badge">Admin</span>}
            {s.active && !s.is_admin && (
              <button type="button" disabled={deactivatingId === s.id} aria-busy={deactivatingId === s.id}
                      onClick={() => void deactivate(s.id)}>
                {deactivatingId === s.id ? '…' : 'Deaktivieren'}
              </button>
            )}
            {!s.active && <span class="origin">deaktiviert</span>}
          </li>
        ))}
      </ul>

      <h2>Protokoll</h2>
      <ul class="task-list audit">
        {audit.map((a) => (
          <li key={a.id} class="task-row nums">
            <time dateTime={a.occurred_at}>{new Date(a.occurred_at).toLocaleString('de-DE')}</time>
            <span>{a.action}</span>
            <span>{a.entity_type} {a.entity_id.slice(0, 8)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
