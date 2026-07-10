import { useSignal } from '@preact/signals'
import type { LedgerApp } from '../state'
import { DEPARTMENTS, type Department } from '../../domain/task'
import { DEPARTMENT_LABELS } from '../../domain/labels'

export function CaptureBar({ app }: { app: LedgerApp }) {
  const text = useSignal('')
  const ref = useSignal('')
  const department = useSignal<Department>('front-office')
  const wichtig = useSignal(false)
  const expanded = useSignal(false)
  const confirmMsg = useSignal('')

  const submit = (e: Event) => {
    e.preventDefault()
    const task = app.addTask({
      text: text.value,
      ref: ref.value,
      department: department.value,
      priority: wichtig.value ? 'wichtig' : 'normal',
    })
    if (!task) return
    confirmMsg.value = `Aufgabe erfasst: ${task.ref ? `${task.ref} – ` : ''}${task.text}`
    text.value = ''
    ref.value = ''
    wichtig.value = false
    // department is intentionally kept — entries often repeat per department
  }

  return (
    <form class="capture no-print" onSubmit={submit}>
      <p aria-live="polite" class="visually-hidden">{confirmMsg.value}</p>
      <div class="capture-row">
        <input
          class="capture-text" type="text" maxLength={200}
          placeholder="Neue Aufgabe … (keine Gastnamen)"
          aria-label="Neue Aufgabe, keine Gastnamen"
          value={text.value}
          onInput={(e) => (text.value = e.currentTarget.value)}
          onFocus={() => (expanded.value = true)}
        />
        <button class="capture-add" type="submit">Erfassen</button>
      </div>
      {expanded.value && (
        <div class="capture-details">
          <input
            class="capture-ref nums" type="text" inputMode="numeric" maxLength={24}
            placeholder="Zimmer / Ref." aria-label="Zimmer oder Referenz"
            value={ref.value}
            onInput={(e) => (ref.value = e.currentTarget.value)}
          />
          <fieldset class="chips">
            <legend class="visually-hidden">Abteilung</legend>
            {DEPARTMENTS.map((d) => (
              <label key={d} class={`chip${department.value === d ? ' on' : ''}`}>
                <input
                  type="radio" name="department" value={d}
                  checked={department.value === d}
                  onChange={() => (department.value = d)}
                />
                <span>{DEPARTMENT_LABELS[d]}</span>
              </label>
            ))}
          </fieldset>
          <label class="wichtig-toggle">
            <input
              type="checkbox" checked={wichtig.value}
              onChange={(e) => (wichtig.value = e.currentTarget.checked)}
            />
            Wichtig
          </label>
          <p class="pii-hint">Keine Gastnamen oder Kontaktdaten – nur Zimmer und Sache.</p>
        </div>
      )}
    </form>
  )
}
