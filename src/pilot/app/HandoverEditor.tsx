import { useEffect, useState } from 'preact/hooks'
import { DEPARTMENTS, type Department } from '../../domain/task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { formatServiceDate } from '../domain/berlin'
import { containsLikelyContact } from '../domain/signature'
import { HANDOVER_STATUS_LABELS, PILOT_TASK_STATUS_LABELS } from '../domain/labels'
import type { HandoverRow, PilotApi, SignatureRow, TaskRow } from '../api/rpc'
import { GuestCaseDrawer } from './GuestCaseDrawer'
import { ReviewPublish } from './ReviewPublish'

export const TEMPLATES: Array<{ key: string; label: string; prefill: string }> = [
  { key: 'technik', label: 'Technik', prefill: 'Technik: ' },
  { key: 'zimmer_pruefen', label: 'Zimmer prüfen', prefill: 'Zimmer prüfen: ' },
  { key: 'rechnung_beleg', label: 'Rechnung/Beleg', prefill: 'Rechnung/Beleg: ' },
  { key: 'fruehstueck', label: 'Frühstück', prefill: 'Frühstück: ' },
  { key: 'rueckruf', label: 'Rückruf', prefill: 'Rückruf: ' },
]

interface Props { api: PilotApi; signature: SignatureRow | null; handoverId: string }

export function HandoverEditor({ api, signature, handoverId }: Props) {
  const [handover, setHandover] = useState<HandoverRow | null>(null)
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [text, setText] = useState('')
  const [department, setDepartment] = useState<Department>('front-office')
  const [ref, setRef] = useState('')
  const [wichtig, setWichtig] = useState(false)
  const [template, setTemplate] = useState<string | null>(null)
  const [guestCaseId, setGuestCaseId] = useState<string | null>(null)
  const [hint, setHint] = useState('')

  useEffect(() => {
    let live = true
    void api.handoverById(handoverId).then((r) => { if (live && r.ok) setHandover(r.value) })
    void api.tasksFor(handoverId).then((r) => { if (live && r.ok) setTasks(r.value) })
    return () => { live = false }
  }, [api, handoverId])

  const refresh = () => void api.tasksFor(handoverId).then((r) => { if (r.ok) setTasks(r.value) })

  const capture = async (e: Event) => {
    e.preventDefault()
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const trimmed = text.trim()
    if (!trimmed) return
    if (containsLikelyContact(trimmed)) {
      setHint('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')
      return
    }
    const res = await api.addTask({
      handoverId, signatureId: signature.id, text: trimmed, roomReference: ref,
      department, priority: wichtig ? 'wichtig' : 'normal',
      guestCaseId, template,
    })
    if (res.ok) {
      setText(''); setRef(''); setWichtig(false); setTemplate(null); setGuestCaseId(null); setHint('')
      refresh()
    } else {
      setHint(res.error.kind === 'validation'
        ? 'Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.'
        : 'Keine Verbindung. Änderung nicht gespeichert.')
    }
  }

  const complete = async (t: TaskRow) => {
    if (!signature) { setHint('Wer arbeitet gerade? Kürzel wählen oder anlegen.'); return }
    const res = await api.completeTask(t.id, signature.id, t.version)
    if (!res.ok && res.error.kind === 'conflict') {
      setHint('Inhalt wurde zwischenzeitlich geändert. Neu geladen – bitte prüfen.')
    }
    refresh()
  }

  if (!handover) return <section class="editor"><p class="empty">Lade Übergabe …</p></section>
  const isDraft = handover.status === 'draft'

  return (
    <section class="editor">
      <p class="context nums">
        {SHIFT_LABELS[handover.source_shift]} {DEPARTMENT_LABELS[handover.source_department]} → {SHIFT_LABELS[handover.target_shift]} {DEPARTMENT_LABELS[handover.target_department]} · {formatServiceDate(handover.service_date)}
      </p>
      <h1>Übergabe · {HANDOVER_STATUS_LABELS[handover.status]}</h1>

      <ul class="task-list">
        {tasks.map((t) => (
          <li key={t.id} class="task-row" data-priority={t.priority} data-status={t.status}>
            {t.room_reference && <span class="nums ref">{t.room_reference}</span>}
            <span class="text">{t.text}</span>
            {t.priority === 'wichtig' && <span class="badge">Wichtig</span>}
            {t.carry_over_from_task_id && <span class="origin">übertragen aus früherer Übergabe</span>}
            {t.guest_case_id && <GuestCaseDrawer api={api} signature={signature} caseId={t.guest_case_id} />}
            {t.status === 'open'
              ? <button type="button" onClick={() => void complete(t)}>Als erledigt markieren</button>
              : <span class="done-label">{PILOT_TASK_STATUS_LABELS[t.status]}</span>}
          </li>
        ))}
        {tasks.length === 0 && <li class="empty">Noch keine Aufgaben. Unten erfassen — Zimmer oder Stichwort genügt.</li>}
      </ul>

      {isDraft && (
        <form class="capture" aria-label="Aufgabe erfassen" onSubmit={capture}>
          <div class="templates" role="group" aria-label="Vorlagen">
            {TEMPLATES.map((tpl) => (
              <button type="button" key={tpl.key} class="chip" aria-pressed={template === tpl.key}
                      onClick={() => { setTemplate(tpl.key); setText(tpl.prefill) }}>
                {tpl.label}
              </button>
            ))}
          </div>
          <input value={text} maxlength={200} placeholder="Neue Aufgabe … (keine Gastnamen)"
                 onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)} />
          <div class="capture-details">
            <label>Ref<input class="nums" value={ref} maxlength={24}
                   onInput={(e) => setRef((e.currentTarget as HTMLInputElement).value)} /></label>
            <fieldset><legend class="visually-hidden">Abteilung</legend>
              {DEPARTMENTS.map((d) => (
                <label class="chip" key={d}>
                  <input type="radio" name="department" checked={department === d}
                         onChange={() => setDepartment(d)} />{DEPARTMENT_LABELS[d]}
                </label>
              ))}
            </fieldset>
            <label class="chip"><input type="checkbox" checked={wichtig}
                   onChange={(e) => setWichtig((e.currentTarget as HTMLInputElement).checked)} />Als wichtig markieren</label>
            <GuestCaseDrawer api={api} signature={signature} caseId={guestCaseId}
                             onCreated={setGuestCaseId} creatable />
          </div>
          <button type="submit">Erfassen</button>
          {hint && <p class="hint" role="status">{hint}</p>}
        </form>
      )}

      <ReviewPublish api={api} signature={signature} handover={handover} tasks={tasks}
                     onChanged={(h) => setHandover(h)} />
    </section>
  )
}
