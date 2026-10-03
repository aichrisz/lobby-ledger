import { describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { BriefView } from './BriefView'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 13, 30))

describe('BriefView', () => {
  test('shows shift transition, date, time and counts', () => {
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204', priority: 'wichtig' })
    render(<BriefView app={app} />)
    expect(screen.getByText(/Früh → Spät/)).toBeTruthy()
    expect(screen.getByText(/13:30/)).toBeTruthy()
    expect(screen.getByText(/1 offen · 1 wichtig · 0 erledigt/)).toBeTruthy()
  })
  test('groups open tasks under department headings', () => {
    const app = mkApp()
    app.addTask({ text: 'Extra Kissen', ref: '310', department: 'housekeeping' })
    render(<BriefView app={app} />)
    expect(screen.getByRole('heading', { name: 'Housekeeping' })).toBeTruthy()
    expect(screen.getByText('310')).toBeTruthy()
  })
  test('saves a separate local snapshot and records receipt without completing tasks', () => {
    const app = mkApp()
    const task = app.addTask({ text: 'Wasserkocher defekt', ref: '204' })!
    render(<BriefView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Übergabe lokal sichern' }))

    const saved = screen.getByRole('region', { name: 'Gespeicherte Übergabe' })
    expect(within(saved).getByText('Wasserkocher defekt')).toBeTruthy()
    expect(within(saved).getByText(/Nur in diesem Browser gespeichert/)).toBeTruthy()
    expect(app.tasks.value.find((item) => item.id === task.id)?.status).toBe('open')

    const receipt = screen.getByRole('button', { name: 'Übergabe erhalten' })
    fireEvent.click(receipt)
    expect(app.handoverSnapshot.value?.receivedAt).toBe(new Date(2026, 6, 10, 13, 30).toISOString())
    expect((receipt as HTMLButtonElement).disabled).toBe(true)
    expect(within(saved).getByText(/Erhalten am/)).toBeTruthy()
    expect(app.tasks.value.find((item) => item.id === task.id)?.status).toBe('open')
  })
  test('saved transition and counts stay frozen across live shift and task changes', () => {
    const app = mkApp()
    const task = app.addTask({ text: 'Wasserkocher prüfen', priority: 'wichtig' })!
    render(<BriefView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Übergabe lokal sichern' }))

    act(() => {
      app.setShift('spaet')
      app.setStatus(task.id, 'done')
      app.addTask({ text: 'Neue Aufgabe' })
    })

    const saved = screen.getByRole('region', { name: 'Gespeicherte Übergabe' })
    expect(screen.getByText(/Spät → Nacht/)).toBeTruthy()
    expect(within(saved).getByText(/Früh → Spät/)).toBeTruthy()
    expect(within(saved).getByText(/1 offen · 1 wichtig · 0 erledigt diese Schicht/)).toBeTruthy()
  })
  test('allows an empty snapshot and labels replacement explicitly', () => {
    render(<BriefView app={mkApp()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Übergabe lokal sichern' }))
    const saved = screen.getByRole('region', { name: 'Gespeicherte Übergabe' })
    expect(within(saved).getByText('Keine offenen Aufgaben. Gute Übergabe!')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Übergabe ersetzen' })).toBeTruthy()
  })
  test('all-clear message when nothing is open', () => {
    render(<BriefView app={mkApp()} />)
    expect(screen.getByText('Keine offenen Aufgaben. Gute Übergabe!')).toBeTruthy()
  })
  test('done-this-shift section lists completed tasks', () => {
    const app = mkApp()
    const t = app.addTask({ text: 'Taxi 06:30 bestellt', ref: '118' })!
    app.setStatus(t.id, 'done')
    render(<BriefView app={app} />)
    expect(screen.getByRole('heading', { name: /Erledigt diese Schicht \(1\)/ })).toBeTruthy()
  })
  test('wichtig tasks are announced for screen readers, not color-only', () => {
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204', priority: 'wichtig' })
    render(<BriefView app={app} />)
    expect(screen.getByText('Wichtig:')).toBeTruthy()
  })

  test('copy button confirms with "Kopiert ✓"', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.resolve() }, configurable: true,
    })
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204' })
    render(<BriefView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
    await waitFor(() => expect(screen.getByText('Kopiert ✓')).toBeTruthy())
  })

  test('clipboard rejection opens the manual-copy fallback with the brief text', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true,
    })
    const app = mkApp()
    app.addTask({ text: 'Wasserkocher defekt', ref: '204' })
    render(<BriefView app={app} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
    await waitFor(() => {
      const box = screen.getByRole('dialog', { name: 'Manuell kopieren' })
      expect((box.querySelector('textarea') as HTMLTextAreaElement).value).toContain('ÜBERGABE')
    })
  })

  test('print button calls window.print', () => {
    window.print ??= () => {} // happy-dom does not implement print
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<BriefView app={mkApp()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Drucken' }))
    expect(print).toHaveBeenCalledOnce()
    print.mockRestore()
  })
})
