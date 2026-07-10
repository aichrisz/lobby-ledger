import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { sortOpenTasks, TasksView } from './TasksView'
import type { Task } from '../../domain/task'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 9, 0))
const mk = (o: Partial<Task>): Task => ({
  id: crypto.randomUUID(), text: 'Aufgabe', ref: '', department: 'front-office',
  priority: 'normal', status: 'open', createdAt: '2026-07-10T07:00:00.000Z',
  createdShift: 'frueh', doneAt: null, ...o,
})

describe('sortOpenTasks', () => {
  test('wichtig first, then newest first', () => {
    const oldNormal = mk({ createdAt: '2026-07-10T06:00:00.000Z' })
    const newNormal = mk({ createdAt: '2026-07-10T08:00:00.000Z' })
    const wichtig = mk({ priority: 'wichtig', createdAt: '2026-07-10T05:00:00.000Z' })
    expect(sortOpenTasks([oldNormal, newNormal, wichtig]).map((t) => t.id))
      .toEqual([wichtig.id, newNormal.id, oldNormal.id])
  })
})

describe('TasksView', () => {
  test('empty state shows calm guidance', () => {
    render(<TasksView app={mkApp()} />)
    expect(screen.getByText(/Noch keine Aufgaben/)).toBeTruthy()
  })
  test('renders ref, text, department and shift metadata', () => {
    const app = mkApp()
    app.addTask({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' })
    render(<TasksView app={app} />)
    expect(screen.getByText('310')).toBeTruthy()
    expect(screen.getByText('Extra Kissen gewünscht')).toBeTruthy()
    expect(screen.getByText(/Housekeeping/)).toBeTruthy()
  })
  test('status button toggles done and moves task to collapsed Erledigt section', () => {
    const app = mkApp()
    app.addTask({ text: 'Taxi bestellen' })
    render(<TasksView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Als erledigt markieren' }))
    expect(app.tasks.value[0]!.status).toBe('done')
    const disclosure = screen.getByRole('button', { name: /Erledigt \(1\)/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(disclosure)
    expect(screen.getByRole('button', { name: 'Als offen markieren' })).toBeTruthy()
  })
  test('all-done state appears when tasks exist but none are open', () => {
    const app = mkApp()
    app.addTask({ text: 'Taxi bestellen' })
    app.setStatus(app.tasks.value[0]!.id, 'done')
    render(<TasksView app={app} />)
    expect(screen.getByText(/Alles erledigt/)).toBeTruthy()
  })
  test('delete button removes the task and stages undo', () => {
    const app = mkApp()
    app.addTask({ text: 'Blumen gießen' })
    render(<TasksView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Aufgabe löschen' }))
    expect(app.tasks.value).toHaveLength(0)
    expect(app.lastDeleted.value?.text).toBe('Blumen gießen')
  })
})
