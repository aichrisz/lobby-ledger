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

type MediaChangeListener = (event: MediaQueryListEvent) => void

function mockSystemTheme(dark = false, listenerApi: 'modern' | 'legacy' | 'both' = 'both') {
  const listeners = new Set<MediaChangeListener>()
  const media = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    dispatchEvent: () => true,
    change(next: boolean) {
      media.matches = next
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent))
    },
  } as {
    matches: boolean
    media: string
    onchange: null
    dispatchEvent: () => boolean
    change(next: boolean): void
    addEventListener?: ReturnType<typeof vi.fn>
    removeEventListener?: ReturnType<typeof vi.fn>
    addListener?: ReturnType<typeof vi.fn>
    removeListener?: ReturnType<typeof vi.fn>
  }
  if (listenerApi === 'modern' || listenerApi === 'both') {
    media.addEventListener = vi.fn((_type: string, listener: MediaChangeListener) => listeners.add(listener))
    media.removeEventListener = vi.fn((_type: string, listener: MediaChangeListener) => listeners.delete(listener))
  }
  if (listenerApi === 'legacy' || listenerApi === 'both') {
    media.addListener = vi.fn((listener: MediaChangeListener) => listeners.add(listener))
    media.removeListener = vi.fn((listener: MediaChangeListener) => listeners.delete(listener))
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  return media
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

  test('moves the selected date with the previous and next date controls', async () => {
    const ledgerApi = api()
    render(<SimplePilotApp deps={deps(ledgerApi)} />)
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    await screen.findByRole('heading', { name: 'Aufgaben' })

    fireEvent.click(screen.getByRole('button', { name: 'Vorheriger Tag' }))
    expect(await screen.findByDisplayValue('2026-07-10')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Tag' }))
    expect(await screen.findByDisplayValue('2026-07-11')).toBeTruthy()
  })

  test('lets the header theme control persist an override and return to the system preference', async () => {
    const media = mockSystemTheme(false)
    const storage = fakeStorage()
    const view = render(<SimplePilotApp deps={deps(api(), storage)} />)
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    await screen.findByRole('heading', { name: 'Aufgaben' })

    const control = screen.getByRole('button', { name: 'Darstellung: System' })
    expect(control.getAttribute('aria-pressed')).toBe('false')
    expect(document.documentElement.dataset.theme).toBe('light')

    fireEvent.click(control)
    expect(screen.getByRole('button', { name: 'Darstellung: Dunkel' }).getAttribute('aria-pressed')).toBe('true')
    expect(storage.getItem('lobby-ledger:simple-theme')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    view.unmount()
    render(<SimplePilotApp deps={deps(api(), storage)} />)
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '4815' } })
    fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
    await screen.findByRole('heading', { name: 'Aufgaben' })
    expect(screen.getByRole('button', { name: 'Darstellung: Dunkel' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Darstellung: Dunkel' }))
    expect(screen.getByRole('button', { name: 'Darstellung: Hell' }).getAttribute('aria-pressed')).toBe('false')
    expect(storage.getItem('lobby-ledger:simple-theme')).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Darstellung: Hell' }))
    expect(screen.getByRole('button', { name: 'Darstellung: System' })).toBeTruthy()
    expect(storage.getItem('lobby-ledger:simple-theme')).toBe('system')

    media.change(true)
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Darstellung: System' }))
    media.change(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
    vi.unstubAllGlobals()
  })

  test('reacts to system theme changes and removes the matching modern MediaQueryList listener on unmount', async () => {
    const media = mockSystemTheme(false, 'modern')
    const addEventListener = media.addEventListener!
    const removeEventListener = media.removeEventListener!
    const view = render(<SimplePilotApp deps={deps(api())} />)

    try {
      expect(media.addListener).toBeUndefined()
      expect(addEventListener).toHaveBeenCalledTimes(1)
      const listener = addEventListener.mock.calls[0]![1]!
      media.change(true)
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))

      view.unmount()
      expect(removeEventListener).toHaveBeenCalledWith('change', listener)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('reacts to system theme changes and removes the matching legacy MediaQueryList listener on unmount', async () => {
    const media = mockSystemTheme(true, 'legacy')
    const addListener = media.addListener!
    const removeListener = media.removeListener!
    const view = render(<SimplePilotApp deps={deps(api())} />)

    try {
      expect(media.addEventListener).toBeUndefined()
      expect(addListener).toHaveBeenCalledTimes(1)
      const listener = addListener.mock.calls[0]![0]!
      media.change(false)
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))

      view.unmount()
      expect(removeListener).toHaveBeenCalledWith(listener)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('restores the prior document theme state when unmounted', () => {
    const root = document.documentElement

    try {
      root.dataset.theme = 'dark'
      const existingTheme = render(<SimplePilotApp deps={deps(api(), fakeStorage({ 'lobby-ledger:simple-theme': 'light' }))} />)
      expect(root.dataset.theme).toBe('light')
      existingTheme.unmount()
      expect(root.dataset.theme).toBe('dark')

      delete root.dataset.theme
      const missingTheme = render(<SimplePilotApp deps={deps(api(), fakeStorage({ 'lobby-ledger:simple-theme': 'dark' }))} />)
      expect(root.dataset.theme).toBe('dark')
      missingTheme.unmount()
      expect(root.dataset.theme).toBeUndefined()
    } finally {
      delete root.dataset.theme
    }
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
