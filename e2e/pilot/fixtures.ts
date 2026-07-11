import { expect, test as base, type Page, type Route } from '@playwright/test'

type Shift = 'frueh' | 'spaet' | 'nacht'
type Department = 'front-office' | 'housekeeping' | 'restaurant'
type Priority = 'normal' | 'wichtig'
type Status = 'open' | 'done'

interface Task {
  id: string
  text: string
  ref: string
  department: Department
  priority: Priority
  status: Status
  createdAt: string
  createdShift: Shift
  doneAt: string | null
}

interface PilotFixtures {
  pilotMockRequests: string[]
}

const E2E_PIN = 'e2e-pin'
const contactPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+|\+?\d[\d\s/.\-]{7,}\d/

function taskSet(date: string, shift: Shift): string {
  return `${date}:${shift}`
}

function json(route: Route, status: number, body?: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function requestBody(route: Route): Record<string, unknown> {
  try {
    const value = route.request().postDataJSON()
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

/**
 * Installs a deterministic, per-browser protocol/UI mock for the static pilot build.
 *
 * It deliberately handles only the configured Playwright app origin. Its responses,
 * including the contact-data error path, exercise browser UI behavior only; server
 * authorization and validation policy are covered by the real API test suite.
 */
async function installPilotApiMock(page: Page, baseURL: string, mockRequests: string[]): Promise<void> {
  let authenticated = false
  let nextId = 1
  const tasks = new Map<string, Task[]>()
  const appOrigin = new URL(baseURL).origin

  await page.route(`${appOrigin}/api/pin`, async (route) => {
    mockRequests.push(route.request().url())
    const body = requestBody(route)
    if (route.request().method() !== 'POST' || body.pin !== E2E_PIN) {
      return json(route, 401, { error: 'PIN ungültig' })
    }
    // The mock deliberately keeps auth only in this per-test closure; it neither reads
    // an environment value nor creates a browser-visible production-like credential.
    authenticated = true
    return json(route, 200, { ok: true })
  })

  await page.route(`${appOrigin}/api/ledger**`, async (route) => {
    mockRequests.push(route.request().url())
    if (!authenticated) return json(route, 401, { error: 'PIN erforderlich' })

    const request = route.request()
    const url = new URL(request.url())
    const body = requestBody(route)
    const method = request.method()
    const date = String(body.date ?? url.searchParams.get('date') ?? '')
    const shift = String(body.shift ?? url.searchParams.get('shift') ?? '') as Shift
    const key = taskSet(date, shift)

    if (method === 'GET' || (method === 'POST' && body.operation === 'read')) {
      return json(route, 200, { tasks: tasks.get(key) ?? [] })
    }

    if (method === 'POST') {
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      // UI error-path response only; api/ledger.test.ts verifies the real server contract.
      if (contactPattern.test(text)) return json(route, 400, { error: 'Kontaktdaten gehören nicht in Aufgaben' })
      const task: Task = {
        id: `e2e-${nextId++}`,
        text,
        ref: typeof body.ref === 'string' ? body.ref : '',
        department: body.department === 'housekeeping' || body.department === 'restaurant' ? body.department : 'front-office',
        priority: body.priority === 'wichtig' ? 'wichtig' : 'normal',
        status: 'open',
        createdAt: new Date(nextId * 1_000).toISOString(),
        createdShift: shift,
        doneAt: null,
      }
      tasks.set(key, [...(tasks.get(key) ?? []), task])
      return json(route, 201, { task })
    }

    const id = url.searchParams.get('id')
    const existing = (tasks.get(key) ?? []).find((task) => task.id === id)
    if (!existing) return json(route, 404, { error: 'Aufgabe nicht gefunden' })

    if (method === 'PATCH') {
      existing.status = body.status === 'done' ? 'done' : 'open'
      existing.doneAt = existing.status === 'done' ? new Date(nextId * 1_000).toISOString() : null
      return json(route, 200, { task: existing })
    }
    if (method === 'DELETE') {
      tasks.set(key, (tasks.get(key) ?? []).filter((task) => task.id !== id))
      return json(route, 204)
    }
    return json(route, 405, { error: 'Methode nicht erlaubt' })
  })
}

export const test = base.extend<PilotFixtures>({
  pilotMockRequests: async ({}, use) => {
    await use([])
  },
  page: async ({ page, baseURL, pilotMockRequests }, use) => {
    if (!baseURL) throw new Error('Pilot E2E requires Playwright baseURL to scope the browser protocol mock')
    await installPilotApiMock(page, baseURL, pilotMockRequests)
    await use(page)
  },
})

export { expect, E2E_PIN }

export async function unlock(page: Page): Promise<void> {
  await page.goto('/pilot.html')
  await expect(page.getByLabel('PIN')).toBeVisible()
  await page.getByLabel('PIN').fill(E2E_PIN)
  await page.getByRole('button', { name: 'Öffnen' }).click()
  await expect(page.getByRole('heading', { name: 'Aufgaben' })).toBeVisible()
}
