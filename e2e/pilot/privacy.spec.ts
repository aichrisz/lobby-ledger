import { expect, test } from '@playwright/test'

test('network egress is limited to the app origin and the configured Supabase origin', async ({ page, baseURL }) => {
  const allowed = new Set([
    new URL(baseURL!).origin,
    new URL(process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321').origin,
  ])
  const offending: string[] = []
  page.on('request', (req) => {
    const origin = new URL(req.url()).origin
    if (!allowed.has(origin)) offending.push(req.url())
  })
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
  expect(offending).toEqual([])
})

test('pilot page is noindex and carries the Supabase-scoped CSP', async ({ page }) => {
  await page.goto('/pilot.html')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("default-src 'self'")
  expect(csp).not.toContain('%SUPABASE_ORIGIN%') // placeholder must be substituted at build
})

test('guest contact values never render without the audited reveal action', async ({ page }, testInfo) => {
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await page.getByRole('button', { name: /^AB ·/ }).click()
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Nächster Tag' }).click()
  }
  const nightColumn = page.locator('.shift-col').filter({
    has: page.getByRole('heading', { name: 'Nacht', exact: true }),
  })
  await nightColumn.getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByRole('button', { name: 'Gastbezug (optional)' }).click()
  await page.getByLabel('Zweck (erforderlich)').selectOption('callback')
  await page.getByLabel('Gastname').fill('Testgast Synthetisch')
  await page.getByLabel('Kontaktart').selectOption('phone')
  await page.getByLabel('Kontakt', { exact: true }).fill('+49 000 111')
  await page.getByRole('button', { name: 'Gastfall speichern' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Rückruf erledigen — Details im Gastfall')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('••• 11')).toBeVisible()
  await expect(page.getByText('+49 000 111')).not.toBeVisible()
  await page.getByRole('button', { name: 'Kontakt anzeigen (wird protokolliert)' }).click()
  await expect(page.getByText('+49 000 111')).toBeVisible()
})
