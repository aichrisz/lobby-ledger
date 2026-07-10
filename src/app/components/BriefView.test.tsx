import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/preact'
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
})
