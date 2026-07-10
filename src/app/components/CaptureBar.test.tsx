import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { createLedgerApp } from '../state'
import { CaptureBar } from './CaptureBar'

const mkApp = () => createLedgerApp(fakeStorage(), () => new Date(2026, 6, 10, 9, 0))
const textInput = () => screen.getByLabelText('Neue Aufgabe, keine Gastnamen') as HTMLInputElement

describe('CaptureBar', () => {
  test('one-tap capture: text + Erfassen creates task with defaults and clears input', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.input(textInput(), { target: { value: 'Zimmer 204: Wasserkocher defekt' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Erfassen' }).closest('form')!)
    expect(app.tasks.value).toHaveLength(1)
    expect(app.tasks.value[0]!.department).toBe('front-office')
    expect(app.tasks.value[0]!.priority).toBe('normal')
    expect(textInput().value).toBe('')
  })
  test('whitespace-only text does nothing and keeps the input value', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.input(textInput(), { target: { value: '   ' } })
    fireEvent.submit(textInput().closest('form')!)
    expect(app.tasks.value).toHaveLength(0)
    expect(textInput().value).toBe('   ')
  })
  test('details expand on focus; ref, department and Wichtig are applied', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.focus(textInput())
    fireEvent.input(screen.getByLabelText('Zimmer oder Referenz'), { target: { value: '310' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Housekeeping' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wichtig' }))
    fireEvent.input(textInput(), { target: { value: 'Extra Kissen gewünscht' } })
    fireEvent.submit(textInput().closest('form')!)
    const t = app.tasks.value[0]!
    expect(t.ref).toBe('310')
    expect(t.department).toBe('housekeeping')
    expect(t.priority).toBe('wichtig')
  })
  test('after submit: department persists, Wichtig resets, confirmation is announced', () => {
    const app = mkApp()
    render(<CaptureBar app={app} />)
    fireEvent.focus(textInput())
    fireEvent.click(screen.getByRole('radio', { name: 'Restaurant' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wichtig' }))
    fireEvent.input(textInput(), { target: { value: 'Frühstück bis 11 Uhr verlängert' } })
    fireEvent.submit(textInput().closest('form')!)
    expect((screen.getByRole('radio', { name: 'Restaurant' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: 'Wichtig' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByText(/Aufgabe erfasst: Frühstück/)).toBeTruthy()
  })
})
