import { afterEach, describe, expect, test, vi } from 'vitest'
import { createLedgerApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('simple ledger browser API', () => {
  test('reads with POST so a legacy service worker cannot cache database responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tasks: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await createLedgerApi().list('2026-07-11', 'spaet')
    expect(fetchMock).toHaveBeenCalledWith('/api/ledger', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ operation: 'read', date: '2026-07-11', shift: 'spaet' }),
    }))
  })

  test('creates a V1 task in the selected date and source shift task set', async () => {
    const task = {
      id: '1', text: 'Minibar prüfen', ref: '204', department: 'housekeeping',
      priority: 'wichtig', status: 'open', createdAt: 'now', createdShift: 'spaet', doneAt: null,
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ task }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await createLedgerApi().create('2026-07-11', 'spaet', 'AB', {
      text: 'Minibar prüfen', ref: '204', department: 'housekeeping', priority: 'wichtig',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/ledger', expect.objectContaining({
      body: JSON.stringify({
        date: '2026-07-11', shift: 'spaet', initials: 'AB', text: 'Minibar prüfen',
        ref: '204', department: 'housekeeping', priority: 'wichtig',
      }),
    }))
  })
})
