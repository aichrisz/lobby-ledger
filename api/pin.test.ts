import { afterEach, describe, expect, test } from 'vitest'
import handler from './pin'

class ResponseStub {
  statusCode = 200
  headers = new Map<string, string>()
  payload: unknown
  status(code: number) { this.statusCode = code; return this }
  setHeader(name: string, value: string) { this.headers.set(name.toLowerCase(), value); return this }
  json(value: unknown) { this.payload = value; return this }
  end() { return this }
}

const originalPin = process.env.PILOT_PIN
const originalSecret = process.env.PILOT_SESSION_SECRET
afterEach(() => {
  process.env.PILOT_PIN = originalPin
  process.env.PILOT_SESSION_SECRET = originalSecret
})

describe('POST /api/pin', () => {
  test('sets a hardened session cookie for the correct PIN', async () => {
    process.env.PILOT_PIN = '4815'
    process.env.PILOT_SESSION_SECRET = 'a-session-secret-that-is-at-least-32-bytes'
    const res = new ResponseStub()
    await handler({ method: 'POST', headers: {}, body: { pin: '4815' }, query: {} }, res)
    expect(res.statusCode).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    expect(res.payload).toEqual({ ok: true })
  })

  test('returns the same generic rejection for an incorrect PIN', async () => {
    process.env.PILOT_PIN = '4815'
    process.env.PILOT_SESSION_SECRET = 'a-session-secret-that-is-at-least-32-bytes'
    const res = new ResponseStub()
    await handler({ method: 'POST', headers: {}, body: { pin: '0000' }, query: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(res.headers.has('set-cookie')).toBe(false)
    expect(res.payload).toEqual({ error: 'PIN ungültig' })
  })
})
