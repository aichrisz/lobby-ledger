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

  test('supports a non-cacheable POST read for clients migrating off the legacy service worker', async () => {
    listTasks.mockResolvedValue([])
    const res = new ResponseStub()
    await handler({ method: 'POST', headers: { cookie: cookie(), 'sec-fetch-site': 'same-origin', 'x-lobby-ledger': '1' }, body: { operation: 'read', date: '2026-07-11', shift: 'nacht' }, query: {} }, res)
    expect(listTasks).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', '2026-07-11', 'nacht')
    expect(createTask).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })
})
