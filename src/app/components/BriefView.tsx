import { useSignal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import type { LedgerApp } from '../state'
import {
  briefFilename, buildBrief, carriedOverLabel, formatBriefText, formatDateShort, formatTimeShort,
} from '../../domain/brief'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'
import { copyText, downloadText } from '../export'

export function BriefView({ app }: { app: LedgerApp }) {
  const now = app.now()
  const brief = buildBrief(app.tasks.value, app.shift.value, now)
  const snapshot = app.handoverSnapshot.value
  const copied = useSignal<'idle' | 'ok' | 'fail'>('idle')
  const text = formatBriefText(brief)
  useEffect(() => {
    if (copied.value !== 'ok') return
    const timer = setTimeout(() => (copied.value = 'idle'), 2000)
    return () => clearTimeout(timer)
  }, [copied.value])
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
        <div class="brief-actions no-print">
          <button onClick={() => window.print()}>Drucken</button>
          <button aria-live="polite"
            onClick={async () => (copied.value = (await copyText(text)) ? 'ok' : 'fail')}>
            {copied.value === 'ok' ? 'Kopiert ✓' : 'Kopieren'}
          </button>
          <button onClick={() => downloadText(briefFilename(brief), text)}>Als .txt</button>
        </div>
        <p class="brief-export-note no-print">
          Drucken, Kopieren und .txt beziehen sich auf die aktuelle Übergabe.
        </p>
        <div class="brief-actions no-print">
          <button onClick={() => app.createSnapshot()}>
            {snapshot ? 'Übergabe ersetzen' : 'Übergabe lokal sichern'}
          </button>
        </div>
      </header>
      <BriefBody brief={brief} now={now} />
      <section class="saved-snapshot no-print" aria-label="Gespeicherte Übergabe">
        <h2>Gespeicherte Momentaufnahme</h2>
        <p class="snapshot-note">
          Nur in diesem Browser gespeichert. Kein Nachweis, wer die Übergabe erhalten hat.
        </p>
        {snapshot ? (
          <>
            <p class="snapshot-meta">
              Gesichert am <time dateTime={snapshot.brief.generatedAt}>
                {formatDateShort(snapshot.brief.generatedAt)} · {formatTimeShort(snapshot.brief.generatedAt)}
              </time>
            </p>
            <p class="brief-sub">
              {SHIFT_LABELS[snapshot.brief.fromShift]} → {SHIFT_LABELS[snapshot.brief.toShift]}
            </p>
            <p class="brief-counts nums">
              {snapshot.brief.counts.open} offen · {snapshot.brief.counts.wichtig} wichtig · {snapshot.brief.counts.doneThisShift} erledigt diese Schicht
            </p>
            <p class="snapshot-meta" role="status">
              {snapshot.receivedAt
                ? `Erhalten am ${formatDateShort(snapshot.receivedAt)} · ${formatTimeShort(snapshot.receivedAt)}`
                : 'Noch nicht als erhalten markiert.'}
            </p>
            <div class="brief-actions">
              <button disabled={snapshot.receivedAt !== null} onClick={() => app.receiveSnapshot()}>
                Übergabe erhalten
              </button>
            </div>
            <BriefBody brief={snapshot.brief} now={new Date(snapshot.brief.generatedAt)} />
          </>
        ) : (
          <p class="snapshot-meta">Noch keine lokale Übergabe gespeichert.</p>
        )}
      </section>
      {copied.value === 'fail' && <CopyFallback text={text} onClose={() => (copied.value = 'idle')} />}
    </article>
  )
}

function BriefBody({ brief, now }: { brief: ReturnType<typeof buildBrief>; now: Date }) {
  return (
    <>
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
    </>
  )
}

function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div class="copy-fallback no-print" role="dialog" aria-label="Manuell kopieren">
      <p>Manuell kopieren (gedrückt halten und kopieren):</p>
      <textarea readOnly rows={8} value={text} onFocus={(e) => e.currentTarget.select()} />
      <button onClick={onClose}>Schließen</button>
    </div>
  )
}
