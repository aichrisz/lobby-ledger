import type { ApiRequest, ApiResponse } from './_lib/http.js'
import { createTask, deleteTask, listTasks, updateTaskStatus } from './_lib/ledger-store.js'
import { SESSION_COOKIE, verifySessionToken } from './_lib/security.js'
import { parseCreateTask, parseInitials, parseLedgerDate, parseTaskPatch } from './_lib/validation.js'

function header(request: ApiRequest, name: string): string {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function cookieValue(request: ApiRequest, name: string): string | null {
  for (const part of header(request, 'cookie').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      try { return decodeURIComponent(value.join('=')) } catch { return null }
    }
  }
  return null
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function authorize(request: ApiRequest): boolean {
  const secret = process.env.PILOT_SESSION_SECRET
  const token = cookieValue(request, SESSION_COOKIE)
  return Boolean(secret && secret.length >= 32 && token && verifySessionToken(token, secret, Date.now()))
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (!authorize(request)) {
    response.status(401).json({ error: 'PIN erforderlich' })
    return
  }
  if (header(request, 'sec-fetch-site') === 'cross-site') {
    response.status(403).json({ error: 'Anfrage abgelehnt' })
    return
  }
  const organizationId = process.env.PILOT_ORGANIZATION_ID
  if (!validUuid(organizationId)) {
    response.status(500).json({ error: 'Server nicht konfiguriert' })
    return
  }
  const method = request.method ?? 'GET'
  if (method !== 'GET' && header(request, 'x-lobby-ledger') !== '1') {
    response.status(403).json({ error: 'Anfrage abgelehnt' })
    return
  }
  try {
    if (method === 'GET') {
      const date = parseLedgerDate(request.query.date)
      response.status(200).json({ tasks: await listTasks(organizationId, date) })
      return
    }
    if (method === 'POST') {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body as Record<string, unknown> : {}
      if (body.operation === 'read' && Object.keys(body).every((key) => ['operation', 'date'].includes(key))) {
        const date = parseLedgerDate(body.date)
        response.status(200).json({ tasks: await listTasks(organizationId, date) })
        return
      }
      response.status(201).json({ task: await createTask(organizationId, parseCreateTask(request.body)) })
      return
    }
    const id = request.query.id
    if (!validUuid(id)) throw new Error('Ungültige Aufgaben-ID')
    if (method === 'PATCH') {
      response.status(200).json({ task: await updateTaskStatus(organizationId, id, parseTaskPatch(request.body)) })
      return
    }
    if (method === 'DELETE') {
      const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? request.body as Record<string, unknown> : {}
      if (Object.keys(body).some((key) => !['date', 'initials'].includes(key))) throw new Error('Unexpected fields')
      const input = { date: parseLedgerDate(body.date), initials: parseInitials(body.initials) }
      await deleteTask(organizationId, id, input)
      response.status(204).end()
      return
    }
    response.setHeader('Allow', 'GET, POST, PATCH, DELETE')
    response.status(405).json({ error: 'Methode nicht erlaubt' })
  } catch (error) {
    if (error instanceof Error && /^(Ungültig|Kürzel|Aufgabe|Kontaktdaten|Unexpected)/.test(error.message)) {
      response.status(400).json({ error: error.message })
      return
    }
    response.status(500).json({ error: 'Speichern fehlgeschlagen' })
  }
}
