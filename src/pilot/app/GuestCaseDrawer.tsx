import { useEffect, useState } from 'preact/hooks'
import { GUEST_PURPOSES, type GuestPurpose } from '../domain/handover'
import { PURPOSE_LABELS } from '../domain/labels'
import { formatServiceDate } from '../domain/berlin'
import type { GuestCaseMasked, PilotApi, SignatureRow } from '../api/rpc'

interface Props {
  api: PilotApi
  signature: SignatureRow | null
  caseId: string | null
  creatable?: boolean
  onCreated?(id: string): void
}

export function GuestCaseDrawer({ api, signature, caseId, creatable, onCreated }: Props) {
  return caseId
    ? <ExistingCase api={api} signature={signature} caseId={caseId} />
    : creatable && onCreated ? <CreateCase api={api} signature={signature} onCreated={onCreated} /> : null
}

function CreateCase({ api, signature, onCreated }: { api: PilotApi; signature: SignatureRow | null; onCreated(id: string): void }) {
  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState<GuestPurpose | ''>('')
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  if (!open) return <button type="button" class="chip" onClick={() => setOpen(true)}>Gastbezug (optional)</button>

  const save = async (e: Event) => {
    e.preventDefault()
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    if (!purpose) { setHint('Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.'); return }
    const form = new FormData(e.currentTarget as HTMLFormElement)
    setPending(true)
    setHint('')
    const res = await api.createGuestCase({
      signatureId: signature.id, purpose,
      purposeNote: String(form.get('purposeNote') ?? '') || undefined,
      roomReference: String(form.get('room') ?? ''),
      guestName: String(form.get('guestName') ?? '') || undefined,
      contactType: (form.get('contactType') as 'phone' | 'email') || undefined,
      contactValue: String(form.get('contactValue') ?? '') || undefined,
    })
    setPending(false)
    if (res.ok) { setOpen(false); onCreated(res.value) }
    else setHint(res.error.kind === 'validation'
      ? 'Zweck „Sonstiges“ braucht eine kurze Begründung.'
      : 'Keine Verbindung. Änderung nicht gespeichert.')
  }

  const gated = purpose === ''
  return (
    <form class="guest-case" aria-label="Gastfall erfassen" onSubmit={save}>
      <label>Zweck (erforderlich)
        <select value={purpose} onChange={(e) => setPurpose((e.currentTarget as HTMLSelectElement).value as GuestPurpose | '')}>
          <option value="">– wählen –</option>
          {GUEST_PURPOSES.map((p) => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
        </select>
      </label>
      {purpose === 'other' && <label>Begründung<input name="purposeNote" maxlength={120} required /></label>}
      {gated && <p class="hint">Bitte zuerst einen Zweck wählen, dann Name/Kontakt erfassen.</p>}
      <label>Zimmer<input name="room" class="nums" maxlength={24} disabled={gated} /></label>
      <label>Gastname<input name="guestName" maxlength={80} disabled={gated} /></label>
      <label>Kontaktart
        <select name="contactType" disabled={gated}>
          <option value="">–</option><option value="phone">Telefon</option><option value="email">E-Mail</option>
        </select>
      </label>
      <label>Kontakt<input name="contactValue" maxlength={120} disabled={gated} /></label>
      <button type="submit" disabled={gated || pending} aria-busy={pending}>{pending ? '…' : 'Gastfall speichern'}</button>
      {hint && <p class="hint" role="status">{hint}</p>}
    </form>
  )
}

function ExistingCase({ api, signature, caseId }: { api: PilotApi; signature: SignatureRow | null; caseId: string }) {
  const [masked, setMasked] = useState<GuestCaseMasked | null>(null)
  const [revealed, setRevealed] = useState<{ guest_name: string | null; contact_value: string | null } | null>(null)
  const [hint, setHint] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    void api.guestCase(caseId).then((r) => { if (r.ok) setMasked(r.value) })
  }, [api, caseId])
  if (!masked) return null
  if (masked.deleted_at) return <p class="guest-case">Gastdaten gelöscht.</p>

  const reveal = async () => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    setPending(true)
    setHint('')
    const res = await api.revealGuestCase(caseId, signature.id)
    setPending(false)
    if (res.ok && res.value[0]) setRevealed(res.value[0])
    else setHint('Keine Verbindung. Änderung nicht gespeichert.')
  }

  return (
    <div class="guest-case" data-masked={!revealed}>
      <span class="badge">Gastbezug · {PURPOSE_LABELS[masked.purpose]}</span>
      {masked.room_reference && <span class="nums">{masked.room_reference}</span>}
      {revealed ? (
        <>
          <span>{revealed.guest_name}</span>
          <span class="nums">{revealed.contact_value}</span>
        </>
      ) : (
        <>
          {masked.masked_name && <span>{masked.masked_name}</span>}
          {masked.masked_contact && <span class="nums">{masked.masked_contact}</span>}
          <span class="hint">Aus Datenschutzgründen ausgeblendet</span>
          {(masked.has_contact || masked.has_name) && (
            <button type="button" disabled={pending} aria-busy={pending} onClick={() => void reveal()}>
              {pending ? '…' : 'Kontakt anzeigen (wird protokolliert)'}
            </button>
          )}
        </>
      )}
      {masked.expires_at && <span class="origin">Wird gelöscht am {formatServiceDate(masked.expires_at.slice(0, 10))}</span>}
      {hint && <p class="hint" role="status">{hint}</p>}
    </div>
  )
}
