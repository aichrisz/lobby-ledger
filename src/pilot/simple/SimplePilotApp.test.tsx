import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { describe, expect, test, vi } from 'vitest'
import { fakeStorage } from '../../test/fake-storage'
import { SimplePilotApp, type SimplePilotDeps } from './SimplePilotApp'
import { UnauthorizedError, type LedgerApi } from './api'

function api(overrides: Partial<LedgerApi> = {}): LedgerApi {
  return {
    unlock: vi.fn(async () => {}),
    list: vi.fn(async () => []),
    create: vi.fn(async (_date, _initials, text) => ({ id: 'new', text, status: 'open' as const, createdAt: 'now' })),
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
})
