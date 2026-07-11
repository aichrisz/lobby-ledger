import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { describe, expect, test, vi } from 'vitest'
import { fakeStorage } from '../../test/fake-storage'
import { SimplePilotApp, type SimplePilotDeps } from './SimplePilotApp'
import { UnauthorizedError, type LedgerApi } from './api'

function api(overrides: Partial<LedgerApi> = {}): LedgerApi {
  return {
    unlock: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    create: vi.fn(async (_date, shift, _initials, task) => ({
      id: 'new', ...task, status: 'open' as const, createdAt: 'now', createdShift: shift, doneAt: null,
    })),
    setStatus: vi.fn(), delete: vi.fn(), ...overrides,
  }
}

function deps(apiValue: LedgerApi, storage = fakeStorage()): SimplePilotDeps {
  return { api: apiValue, storage, now: () => new Date('2026-07-11T09:00:00Z'), print: vi.fn(), copy: vi.fn(), download: vi.fn() }
}

describe('SimplePilotApp', () => {
  test('shows the PIN gate first when no valid cookie exists', async () => {
    const ledgerApi = api({ list: vi.fn(async () => { throw new UnauthorizedError() }) })
    render(<SimplePilotApp deps={deps(ledgerApi)} />)
    expect(await screen.findByRole('heading', { name: 'Lobby Ledger' })).toBeTruthy()
    expect(screen.getByLabelText('PIN')).toBeTruthy()
  })

  test('unlocks into the date ledger and persists the normalized Kürzel', async () => {
    let unlocked = false
    const ledgerApi = api({
      unlock: vi.fn(async () => { unlocked = true }),
      list: vi.fn(async () => { if (!unlocked) throw new UnauthorizedError(); return [] }),
    })
    const storage = fakeStorage()
    render(<SimplePilotApp deps={deps(ledgerApi, storage)} />)
    await screen.findByLabelText('PIN')
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    expect(await screen.findByRole('heading', { name: 'Aufgaben' })).toBeTruthy()
    fireEvent.input(screen.getByLabelText('Kürzel'), { target: { value: 'ab' } })
    await waitFor(() => expect(storage.getItem('lobby-ledger:initials')).toBe('AB'))
    expect(screen.getByDisplayValue('2026-07-11')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Drucken' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Kopieren' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Als .txt' })).toBeTruthy()
  })

  test('loads and captures the selected shift with V1 task details', async () => {
    const ledgerApi = api()
    render(<SimplePilotApp deps={deps(ledgerApi)} />)
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    await screen.findByRole('heading', { name: 'Aufgaben' })

    fireEvent.click(screen.getByLabelText('Spät'))
    await waitFor(() => expect(ledgerApi.list).toHaveBeenLastCalledWith('2026-07-11', 'spaet'))
    fireEvent.input(screen.getByLabelText('Kürzel'), { target: { value: 'ab' } })
    fireEvent.focus(screen.getByLabelText('Neue Aufgabe, keine Gastnamen'))
    fireEvent.input(screen.getByLabelText('Neue Aufgabe, keine Gastnamen'), { target: { value: 'Minibar prüfen' } })
    fireEvent.input(screen.getByLabelText('Zimmer oder Referenz'), { target: { value: '204' } })
    fireEvent.click(screen.getByLabelText('Housekeeping'))
    fireEvent.click(screen.getByLabelText('Wichtig'))
    fireEvent.click(screen.getByRole('button', { name: 'Erfassen' }))

    await waitFor(() => expect(ledgerApi.create).toHaveBeenCalledWith('2026-07-11', 'spaet', 'AB', {
      text: 'Minibar prüfen', ref: '204', department: 'housekeeping', priority: 'wichtig',
    }))
  })

  test('ignores a stale task-set response after the selected shift changes again', async () => {
    let resolveSpaet!: (tasks: Awaited<ReturnType<LedgerApi['list']>>) => void
    const spaet = new Promise<Awaited<ReturnType<LedgerApi['list']>>>((resolve) => { resolveSpaet = resolve })
    const task = (id: string, text: string, shift: 'frueh' | 'spaet' | 'nacht') => ({
      id, text, ref: '', department: 'front-office' as const, priority: 'normal' as const,
      status: 'open' as const, createdAt: 'now', createdShift: shift, doneAt: null,
    })
    const ledgerApi = api({
      list: vi.fn(async (_date, shift) => shift === 'spaet' ? spaet : shift === 'nacht' ? [task('n', 'Nacht-Aufgabe', 'nacht')] : []),
    })
    render(<SimplePilotApp deps={deps(ledgerApi)} />)
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    await screen.findByRole('heading', { name: 'Aufgaben' })

    fireEvent.click(screen.getByLabelText('Spät'))
    await waitFor(() => expect(ledgerApi.list).toHaveBeenCalledWith('2026-07-11', 'spaet'))
    fireEvent.click(screen.getByLabelText('Nacht'))
    expect(await screen.findByText('Nacht-Aufgabe')).toBeTruthy()
    resolveSpaet([task('s', 'Spät-Aufgabe', 'spaet')])

    await waitFor(() => expect(screen.queryByText('Spät-Aufgabe')).toBeNull())
    expect(screen.getByText('Nacht-Aufgabe')).toBeTruthy()
  })
})
