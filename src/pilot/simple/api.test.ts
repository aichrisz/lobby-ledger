import { afterEach, describe, expect, test, vi } from 'vitest'
import { createLedgerApi } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('simple ledger browser API', () => {
  test('reads with POST so a legacy service worker cannot cache database responses', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ tasks: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    await createLedgerApi().list('2026-07-11')
    expect(fetchMock).toHaveBeenCalledWith('/api/ledger', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ operation: 'read', date: '2026-07-11' }),
    }))
  })
})
