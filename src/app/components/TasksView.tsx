import { useSignal } from '@preact/signals'
import type { LedgerApp } from '../state'
import type { Task } from '../../domain/task'
import { DEPARTMENT_LABELS, SHIFT_LABELS } from '../../domain/labels'

export function sortOpenTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    a.priority !== b.priority
      ? (a.priority === 'wichtig' ? -1 : 1)
      : b.createdAt.localeCompare(a.createdAt),
  )
}

export function TasksView({ app }: { app: LedgerApp }) {
  const showDone = useSignal(false)
  const all = app.tasks.value
  const open = sortOpenTasks(all.filter((t) => t.status === 'open'))
  const done = [...all.filter((t) => t.status === 'done')]
    .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))

  if (all.length === 0) {
    return (
      <div class="empty">
        <h1 class="visually-hidden">Aufgaben</h1>
        <p class="empty-title">Noch keine Aufgaben.</p>
        <p class="empty-hint">Unten erfassen — Zimmer oder Stichwort genügt.</p>
      </div>
    )
  }

  return (
    <div class="tasks">
      <h1 class="visually-hidden">Aufgaben</h1>
      {open.length === 0 ? (
        <p class="all-done">Alles erledigt. Neue Aufgaben unten erfassen.</p>
      ) : (
        <ul class="task-list">
          {open.map((t) => <TaskRow key={t.id} task={t} app={app} />)}
        </ul>
      )}
      {done.length > 0 && (
        <section class="done-section">
          <button
            class="done-toggle" aria-expanded={showDone.value}
            onClick={() => (showDone.value = !showDone.value)}
          >
            Erledigt ({done.length})
          </button>
          {showDone.value && (
            <ul class="task-list is-done">
              {done.map((t) => <TaskRow key={t.id} task={t} app={app} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function TaskRow({ task, app }: { task: Task; app: LedgerApp }) {
  const isDone = task.status === 'done'
  return (
    <li class={`row${task.priority === 'wichtig' ? ' wichtig' : ''}${isDone ? ' done' : ''}`}>
      <button
        class="row-status"
        aria-label={isDone ? 'Als offen markieren' : 'Als erledigt markieren'}
        onClick={() => app.setStatus(task.id, isDone ? 'open' : 'done')}
      >
        {isDone ? '✓' : ''}
      </button>
      <div class="row-main">
        <p class="row-text">
          {task.ref && <strong class="nums">{task.ref}</strong>} {task.text}
        </p>
        <p class="row-meta">
          {DEPARTMENT_LABELS[task.department]}
          {task.priority === 'wichtig' && ' · Wichtig'}
          {' · '}{SHIFT_LABELS[task.createdShift]}
        </p>
      </div>
      <button class="row-delete" aria-label="Aufgabe löschen" onClick={() => app.removeTask(task.id)}>
        ×
      </button>
    </li>
  )
}
