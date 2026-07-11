import { useEffect, useState } from 'preact/hooks'
import type { StorageLike } from '../../storage/store'
import { parseSignatureInput } from '../domain/signature'
import type { PilotApi, SignatureRow } from '../api/rpc'

export const SIGNATURE_KEY = 'lobby-ledger.pilot.signature'

export function loadStoredSignature(storage: StorageLike): SignatureRow | null {
  try {
    const raw = storage.getItem(SIGNATURE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as SignatureRow
    return typeof p.id === 'string' && typeof p.short_code === 'string' ? p : null
  } catch { return null }
}

interface Props {
  api: PilotApi
  storage: StorageLike
  value: SignatureRow | null
  onChange(sig: SignatureRow): void
}

export function SignatureBar({ api, storage, value, onChange }: Props) {
  const [existing, setExisting] = useState<SignatureRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    void api.listSignatures().then((r) => { if (r.ok) setExisting(r.value.filter((s) => s.active)) })
  }, [api])

  const pick = (sig: SignatureRow) => {
    storage.setItem(SIGNATURE_KEY, JSON.stringify(sig))
    onChange(sig)
  }
  const create = async (e: Event) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget as HTMLFormElement)
    const input = parseSignatureInput({
      shortCode: String(data.get('shortCode')), displayName: String(data.get('displayName')),
    })
    if (!input) { setError('Kürzel = 2–4 Buchstaben, z. B. AB'); return }
    const res = await api.ensureSignature(input.shortCode, input.displayName)
    if (res.ok) pick(res.value)
    else setError(res.error.kind === 'validation' ? 'Kürzel = 2–4 Buchstaben, z. B. AB' : 'Speichern fehlgeschlagen.')
  }

  if (value) {
    return (
      <div class="signature-bar" data-active>
        <span class="nums">{value.short_code}</span> · {value.display_name}
        <button type="button" onClick={() => { storage.removeItem(SIGNATURE_KEY); location.reload() }}>Wechseln</button>
      </div>
    )
  }
  return (
    <div class="signature-bar">
      <p>Wer arbeitet gerade? Kürzel wählen oder anlegen.</p>
      {existing.length > 0 && (
        <ul class="signature-list">
          {existing.map((s) => (
            <li key={s.id}><button type="button" onClick={() => pick(s)}>{s.short_code} · {s.display_name}</button></li>
          ))}
        </ul>
      )}
      <form onSubmit={create}>
        <label>Kürzel<input name="shortCode" maxlength={4} autocapitalize="characters" /></label>
        <label>Anzeigename<input name="displayName" maxlength={40} /></label>
        <button type="submit">Übernehmen</button>
      </form>
      {error && <p class="hint" role="status">{error}</p>}
    </div>
  )
}
