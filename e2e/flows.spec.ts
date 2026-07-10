import { expect, test } from '@playwright/test'

test('app boots and shows wordmark', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Lobby Ledger')).toBeVisible()
})

test('capture → brief → copy produces the handover text', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Wasserkocher defekt, Technik informiert')
  await page.getByLabel('Zimmer oder Referenz').fill('204')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await page.getByRole('link', { name: /Übergabe/ }).click()
  await expect(page.getByRole('heading', { name: 'Übergabe' })).toBeVisible()
  await page.getByRole('button', { name: 'Kopieren' }).click()
  await expect(page.getByRole('button', { name: 'Kopiert ✓' })).toBeVisible()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('ÜBERGABE')
  expect(clip).toContain('204 — Wasserkocher defekt, Technik informiert')
})
