import { beforeEach, describe, expect, test, vi } from 'vitest'

const { listTasks, createTask } = vi.hoisted(() => ({ listTasks: vi.fn(), createTask: vi.fn() }))
vi.mock('./_lib/ledger-store', () => ({ listTasks, createTask, updateTaskStatus: vi.fn(), deleteTask: vi.fn() }))

import handler from './ledger'
import { createSessionToken, SESSION_COOKIE } from './_lib/security'

const secret = 'a-session-secret-that-is-at-least-32-bytes'
class ResponseStub {
  statusCode = 200
  headers = new Map<string, string | string[]>()
  payload: unknown
  status(code: number) { this.statusCode = code; return this }
  setHeader(name: string, value: string | string[]) { this.headers.set(name.toLowerCase(), value); return this }
  json(value: unknown) { this.payload = value; return this }
  end() { return this }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PILOT_SESSION_SECRET = secret
  process.env.PILOT_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111'
})

function cookie(): string {
  return `${SESSION_COOKIE}=${createSessionToken(secret, Date.now(), 60)}`
}

describe('/api/ledger', () => {
  test('rejects every request without a valid signed cookie', async () => {
    const res = new ResponseStub()
    await handler({ method: 'GET', headers: {}, body: undefined, query: { date: '2026-07-11' } }, res)
    expect(res.statusCode).toBe(401)
    expect(listTasks).not.toHaveBeenCalled()
  })

  test('reads only through the configured organization scope', async () => {
    listTasks.mockResolvedValue([{ id: 'task-id', text: 'Schlüssel prüfen', status: 'open', createdAt: 'now' }])
    const res = new ResponseStub()
    await handler({ method: 'GET', headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin' }, body: undefined, query: { date: '2026-07-11', shift: 'frueh' } }, res)
    expect(listTasks).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '2026-07-11', 'frueh')
    expect(res.statusCode).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  test('requires the same-origin mutation header before creating', async () => {
    const res = new ResponseStub()
    await handler({ method: 'POST', headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin' }, body: { date: '2026-07-11', initials: 'AB', text: 'Test' }, query: {} }, res)
    expect(res.statusCode).toBe(403)
    expect(createTask).not.toHaveBeenCalled()
  })

  test('rejects contact-like task text at the real API handler before storage', async () => {
    const res = new ResponseStub()
    await handler({
      method: 'POST',
      headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' },
      body: {
        date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Rückruf mail@example.test',
        ref: '', department: 'front-office', priority: 'normal',
      },
      query: {},
    }, res)
    expect(res.statusCode).toBe(400)
    expect(res.payload).toEqual({ error: 'Kontaktdaten gehören nicht in Aufgaben' })
    expect(createTask).not.toHaveBeenCalled()
  })

  test('rejects contact-like room references at the real API handler before storage', async () => {
    const res = new ResponseStub()
    await handler({
      method: 'POST',
      headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' },
      body: {
        date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Schlüssel prüfen',
        ref: 'kontakt@example.invalid', department: 'front-office', priority: 'normal',
      },
      query: {},
    }, res)
    expect(res.statusCode).toBe(400)
    expect(res.payload).toEqual({ error: 'Kontaktdaten gehören nicht in Aufgaben' })
    expect(createTask).not.toHaveBeenCalled()
  })

  test.each(['Rechnung 2026-4711', 'INV-2026-4711', '2026-07-11'])
    ('accepts ordinary room reference %s at the real API handler', async (ref) => {
      const res = new ResponseStub()
      createTask.mockResolvedValue({ id: 'task-id', ref })
      await handler({
        method: 'POST',
        headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' },
        body: {
          date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Schlüssel prüfen',
          ref, department: 'front-office', priority: 'normal',
        },
        query: {},
      }, res)
      expect(res.statusCode).toBe(201)
      expect(createTask).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.objectContaining({ ref }))
    })

  test.each(['0171/2345678', '+49 171 2345678', '123456789'])
    ('rejects phone-like room reference %s at the real API handler', async (ref) => {
      const res = new ResponseStub()
      await handler({
        method: 'POST',
        headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' },
        body: {
          date: '2026-07-11', shift: 'frueh', initials: 'AB', text: 'Schlüssel prüfen',
          ref, department: 'front-office', priority: 'normal',
        },
        query: {},
      }, res)
      expect(res.statusCode).toBe(400)
      expect(res.payload).toEqual({ error: 'Kontaktdaten gehören nicht in Aufgaben' })
      expect(createTask).not.toHaveBeenCalled()
    })

  test('supports a non-cacheable POST read for clients migrating off the legacy service worker', async () => {
    listTasks.mockResolvedValue([])
    const res = new ResponseStub()
    await handler({ method: 'POST', headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' }, body: { operation: 'read', date: '2026-07-11', shift: 'nacht' }, query: {} }, res)
    expect(listTasks).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '2026-07-11', 'nacht')
    expect(createTask).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })
})
