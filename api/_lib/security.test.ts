import { describe, expect, test } from 'vitest'
import {
  createSessionToken,
  pinMatches,
  sessionCookie,
  verifySessionToken,
} from './security'

const secret = 'a-session-secret-long-enough-for-tests'

describe('pilot security', () => {
  test('PIN comparison accepts only the exact configured value', () => {
    expect(pinMatches('4815', '4815')).toBe(true)
    expect(pinMatches('4815', '4816')).toBe(false)
    expect(pinMatches('4815', '48150')).toBe(false)
  })

  test('signed session expires and rejects tampering', () => {
    const token = createSessionToken(secret, 1_000, 120)
    expect(verifySessionToken(token, secret, 120_999)).toBe(true)
    expect(verifySessionToken(token, secret, 121_000)).toBe(false)
    expect(verifySessionToken(`${token}x`, secret, 2_000)).toBe(false)
  })

  test('session cookie is host-only and unavailable to JavaScript', () => {
    const cookie = sessionCookie('signed-value', 28_800)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain=')
  })
})
