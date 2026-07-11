import { type Page } from '@playwright/test'
import { expect, test, unlock } from './fixtures'

async function captureCompleteAndDelete(page: Page) {
  await page.getByLabel('Kürzel').fill('AB')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Minibar prüfen')
  await page.getByRole('button', { name: 'Erfassen' }).click()

  const task = page.getByRole('listitem').filter({ hasText: 'Minibar prüfen' })
  await task.getByRole('button', { name: 'Als erledigt markieren' }).click()
  await page.getByRole('button', { name: 'Erledigt (1)' }).click()
  await page.getByRole('button', { name: 'Aufgabe löschen' }).click()
  await expect(page.getByText('Noch keine Aufgaben für diesen Tag.')).toBeVisible()
}

test('unlocked Simple Pilot makes no cross-origin requests through capture, completion, and deletion', async ({ page, baseURL }) => {
  const appOrigin = new URL(baseURL!).origin
  const offending: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== appOrigin) offending.push(request.url())
  })

  await unlock(page)
  await captureCompleteAndDelete(page)
  expect(offending).toEqual([])
})

test('browser protocol mock does not handle a non-app-origin API URL', async ({ page, pilotMockRequests }) => {
  await page.goto('/pilot.html')
  await page.evaluate(async () => {
    await fetch('http://localhost:4173/api/pin', { method: 'POST', body: JSON.stringify({ pin: 'e2e-pin' }) }).catch(() => undefined)
  })

  expect(pilotMockRequests).toEqual([])
})

test('pilot page remains noindex with a same-origin CSP', async ({ page }) => {
  await page.goto('/pilot.html')

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("connect-src 'self'")
  expect(csp).not.toMatch(/connect-src[^;]*(https?:|\*)/)
})
