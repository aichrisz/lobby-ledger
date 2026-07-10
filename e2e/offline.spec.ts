import { expect, test } from '@playwright/test'

test('app works offline after first visit, including capture', async ({ page, context }) => {
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
  // The worker now controls a real navigation and caches the loaded shell/assets.
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByLabel('Neue Aufgabe, keine Gastnamen')).toBeVisible()
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Offline erfasst: Lampe Flur 2 defekt')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Offline erfasst: Lampe Flur 2 defekt', { exact: true })).toBeVisible()
  await context.setOffline(false)
})

test('manifest is served and linked', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const res = await request.get(href!)
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).name).toBe('Lobby Ledger')
})
