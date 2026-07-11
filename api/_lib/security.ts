import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = '__Host-lobby_ledger_session'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function pinMatches(candidate: unknown, configured: string): boolean {
  const supplied = typeof candidate === 'string' ? candidate : ''
  return timingSafeEqual(digest(supplied), digest(configured))
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload, 'utf8').digest()
}

export function createSessionToken(secret: string, issuedAt: number, ttlSeconds: number): string {
  const expiresAt = issuedAt + (ttlSeconds * 1_000)
  const payload = Buffer.from(`${issuedAt}.${expiresAt}.${randomBytes(16).toString('hex')}`, 'utf8').toString('base64url')
  return `${payload}.${signature(payload, secret).toString('base64url')}`
}

export function verifySessionToken(token: string, secret: string, now: number): boolean {
  const [payload, suppliedSignature, extra] = token.split('.')
  if (!payload || !suppliedSignature || extra) return false
  let decoded: string
  let supplied: Buffer
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf8')
    supplied = Buffer.from(suppliedSignature, 'base64url')
  } catch {
    return false
  }
  const expected = signature(payload, secret)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false
  const [issuedText, expiresText, nonce, tail] = decoded.split('.')
  const issuedAt = Number(issuedText)
  const expiresAt = Number(expiresText)
  return !tail && /^[a-f0-9]{32}$/.test(nonce ?? '') && Number.isSafeInteger(issuedAt)
    && Number.isSafeInteger(expiresAt) && issuedAt <= now && now < expiresAt
}

export function sessionCookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Strict`
}
