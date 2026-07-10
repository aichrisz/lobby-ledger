import { describe, expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/preact'
import { fakeStorage } from '../../test/fake-storage'
import { STORAGE_KEY } from '../../storage/store'
import { createLedgerApp } from '../state'
import { App } from './App'

const at = (h: number) => () => new Date(2026, 6, 10, h, 0)

describe('App shell', () => {
  test('renders wordmark and clock-derived shift as checked radio', () => {
    render(<App app={createLedgerApp(fakeStorage(), at(9))} />)
    expect(screen.getByText('Lobby Ledger')).toBeTruthy()
    expect((screen.getByRole('radio', { name: 'Früh' }) as HTMLInputElement).checked).toBe(true)
  })
  test('tapping a shift radio overrides the shift', () => {
    const app = createLedgerApp(fakeStorage(), at(9))
    render(<App app={app} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Spät' }))
    expect(app.shift.value).toBe('spaet')
  })
  test('Übergabe link shows the open-task count badge', () => {
    const app = createLedgerApp(fakeStorage(), at(9))
    app.addTask({ text: 'Kissen für 310' })
    render(<App app={app} />)
    expect(screen.getByLabelText('1 offene Aufgaben')).toBeTruthy()
  })
  test('#/uebergabe renders the Übergabe view heading', () => {
    location.hash = '#/uebergabe'
    render(<App app={createLedgerApp(fakeStorage(), at(9))} />)
    expect(screen.getByRole('heading', { name: 'Übergabe' })).toBeTruthy()
    location.hash = ''
  })
  test('recovery banner appears when stored data was corrupt', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{broken' })
    render(<App app={createLedgerApp(storage, at(9))} />)
    expect(screen.getByText(/beschädigt/)).toBeTruthy()
  })
})
