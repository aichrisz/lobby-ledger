import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { createSessionToken, pinMatches, sessionCookie } from './_lib/security.js'

const SESSION_SECONDS = 8 * 60 * 60

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Methode nicht erlaubt' })
    return
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    response.status(403).json({ error: 'Anfrage abgelehnt' })
    return
  }
  const configuredPin = process.env.PILOT_PIN
  const secret = process.env.PILOT_SESSION_SECRET
  if (!configuredPin || !secret || secret.length < 32) {
    response.status(500).json({ error: 'Server nicht konfiguriert' })
    return
  }
  const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown> : {}
  const validShape = Object.keys(body).length === 1 && typeof body.pin === 'string' && body.pin.length <= 64
  // Dashboard environment values may carry accidental surrounding whitespace; a numeric
  // team PIN should not become unusable for that reason.
  const suppliedPin = typeof body.pin === 'string' ? body.pin.trim() : ''
  if (!validShape || !pinMatches(suppliedPin, configuredPin.trim())) {
    response.status(401).json({ error: 'PIN ungültig' })
    return
  }
  const token = createSessionToken(secret, Date.now(), SESSION_SECONDS)
  response.setHeader('Set-Cookie', sessionCookie(token, SESSION_SECONDS))
  response.status(200).json({ ok: true })
}
