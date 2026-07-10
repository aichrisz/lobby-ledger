import type { LedgerApp } from '../state'
import { buildBrief, carriedOverLabel, formatDateShort, formatTimeShort } from '../../domain/brief'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'

export function BriefView({ app }: { app: LedgerApp }) {
  const now = app.now()
  const brief = buildBrief(app.tasks.value, app.shift.value, now)
  return (
    <article class="brief">
      <header class="brief-head">
        <h1 class="view-title">Übergabe</h1>
        <p class="brief-sub">
          {SHIFT_LABELS[brief.fromShift]} → {SHIFT_LABELS[brief.toShift]}
          {' · '}{formatDateShort(brief.generatedAt)}{' · '}{formatTimeShort(brief.generatedAt)}
        </p>
        <p class="brief-counts nums">
          {brief.counts.open} offen · {brief.counts.wichtig} wichtig · {brief.counts.doneThisShift} erledigt diese Schicht
        </p>
      </header>
      {brief.sections.length === 0 ? (
        <p class="brief-clear">Keine offenen Aufgaben. Gute Übergabe!</p>
      ) : (
        brief.sections.map((s) => (
          <section key={s.department} class="brief-section">
            <h2>{DEPARTMENT_LABELS[s.department]}</h2>
            <ul>
              {s.tasks.map((t) => {
                const age = carriedOverLabel(t, now)
                return (
                  <li key={t.id} class={t.priority === 'wichtig' ? 'wichtig' : ''}>
                    <span class="mark" aria-hidden="true">{t.priority === 'wichtig' ? '!' : '·'}</span>
                    {t.priority === 'wichtig' && <span class="visually-hidden">Wichtig: </span>}
                    {t.ref && <strong class="nums">{t.ref}</strong>} {t.text}
                    {age && <em class="age"> ({age})</em>}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
      {brief.doneThisShift.length > 0 && (
        <section class="brief-section brief-done">
          <h2>Erledigt diese Schicht ({brief.doneThisShift.length})</h2>
          <ul>
            {brief.doneThisShift.map((t) => (
              <li key={t.id}>{t.ref && <strong class="nums">{t.ref}</strong>} {t.text}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
