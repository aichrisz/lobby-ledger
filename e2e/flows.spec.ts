import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('app boots and shows wordmark', async ({ page }) => {
  await page.goto('/?e2e=1')
  await expect(page.getByText('Lobby Ledger')).toBeVisible()
})

test('capture → brief → copy produces the handover text', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/?e2e=1')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Wasserkocher defekt, Technik informiert')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await expect(page.getByRole('heading', { name: 'Übergabe', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Kopieren' }).click()
  await expect(page.getByRole('button', { name: 'Kopiert ✓' })).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('ÜBERGABE')
  expect(clip).toContain('Wasserkocher defekt, Technik informiert')
})

test('local handover snapshot receipt survives reload and explicit replacement', async ({ page }, testInfo) => {
  const expectedOrigin = new URL(String(testInfo.project.use.baseURL ?? 'http://localhost:4173')).origin
  const externalRequests: string[] = []
  const consoleErrors: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== expectedOrigin) externalRequests.push(request.url())
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.addInitScript(() => {
    if (sessionStorage.getItem('handover-e2e-initialized') !== 'yes') {
      localStorage.clear()
      sessionStorage.setItem('handover-e2e-initialized', 'yes')
    }
  })
  await page.goto('/?e2e=1')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Wasserkocher defekt, Technik informiert')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await page.getByRole('button', { name: 'Übergabe lokal sichern' }).click()

  const saved = page.getByRole('region', { name: 'Gespeicherte Übergabe' })
  await expect(saved.getByText('Wasserkocher defekt, Technik informiert')).toBeVisible()
  const saveButton = page.getByRole('button', { name: 'Übergabe ersetzen' })
  expect((await saveButton.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  const receiveButton = page.getByRole('button', { name: 'Übergabe erhalten' })
  expect((await receiveButton.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  const before = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(before.document).toBeLessThanOrEqual(before.viewport)
  if (testInfo.project.name === 'mobile') {
    await page.screenshot({ path: testInfo.outputPath('local-handover-before-receipt.png'), fullPage: true })
  }

  await receiveButton.click()
  await expect(saved.getByText(/Erhalten am/)).toBeVisible()
  expect(await new AxeBuilder({ page }).analyze()).toMatchObject({ violations: [] })
  if (testInfo.project.name === 'mobile') {
    await page.screenshot({ path: testInfo.outputPath('local-handover-after-receipt.png'), fullPage: true })
  }

  await page.getByRole('link', { name: 'Zurück' }).click()
  await expect(page.getByRole('button', { name: 'Als erledigt markieren' })).toBeVisible()
  await page.getByRole('button', { name: 'Als erledigt markieren' }).click()
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Zusatzaufgabe nur live')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  const unchanged = page.getByRole('region', { name: 'Gespeicherte Übergabe' })
  await expect(unchanged.getByText('Wasserkocher defekt, Technik informiert')).toBeVisible()
  await expect(unchanged.getByText('Zusatzaufgabe nur live')).toHaveCount(0)
  await page.reload()
  const restored = page.getByRole('region', { name: 'Gespeicherte Übergabe' })
  await expect(restored.getByText(/Erhalten am/)).toBeVisible()
  await expect(restored.getByText('Wasserkocher defekt, Technik informiert')).toBeVisible()

  await page.getByRole('button', { name: 'Übergabe ersetzen' }).click()
  await expect(restored.getByText('Zusatzaufgabe nur live')).toBeVisible()
  await expect(restored.getByRole('button', { name: 'Übergabe erhalten' })).toBeEnabled()
  await expect(restored.getByText('Erhalten am')).toHaveCount(0)

  expect(externalRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('local handover snapshot and receipt work offline after the PWA shell is cached', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
      )
    }
  })
  await page.waitForTimeout(250)
  await page.reload()
  await context.setOffline(true)
  await page.reload()

  await expect(page.getByLabel('Neue Aufgabe, keine Gastnamen')).toBeVisible()
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Offline-Momentaufnahme')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await page.getByRole('button', { name: 'Übergabe lokal sichern' }).click()
  const saved = page.getByRole('region', { name: 'Gespeicherte Übergabe' })
  await saved.getByRole('button', { name: 'Übergabe erhalten' }).click()
  await expect(saved.getByText(/Erhalten am/)).toBeVisible()
  await page.reload()
  const restored = page.getByRole('region', { name: 'Gespeicherte Übergabe' })
  await expect(restored.getByText('Offline-Momentaufnahme')).toBeVisible()
  await expect(restored.getByText(/Erhalten am/)).toBeVisible()
  await context.setOffline(false)
})
