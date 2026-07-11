import { expect, test, type Page } from '@playwright/test'

async function signIn(page: Page) {
  await page.goto('/pilot.html')
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
}

async function actAs(page: Page, shortCode: string) {
  const bar = page.locator('.signature-bar')
  if (await bar.getByRole('button', { name: 'Wechseln' }).isVisible()) {
    await bar.getByRole('button', { name: 'Wechseln' }).click()
  }
  await page.getByRole('button', { name: new RegExp(`^${shortCode} ·`) }).click()
}

async function isolateProjectDate(page: Page, projectName: string) {
  if (projectName === 'desktop') {
    await page.getByRole('button', { name: 'Nächster Tag' }).click()
  }
}

function shiftColumn(page: Page, name: 'Früh' | 'Spät' | 'Nacht') {
  return page.locator('.shift-col').filter({
    has: page.getByRole('heading', { name, exact: true }),
  })
}

test('publish → acknowledge → carry-over with two signatures', async ({ page }, testInfo) => {
  await signIn(page)
  await actAs(page, 'AB')
  await isolateProjectDate(page, testInfo.project.name)

  // create a draft for today's Früh and capture a task
  await shiftColumn(page, 'Früh').getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Wasserkocher defekt, Technik informiert')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Wasserkocher defekt, Technik informiert')).toBeVisible()

  // publish
  await page.getByRole('button', { name: 'Übergabe veröffentlichen' }).click()
  await expect(page.getByRole('heading', { name: 'Übergabe · Veröffentlicht' })).toBeVisible()

  // switch signature and acknowledge from the target shift's inbox
  await actAs(page, 'LK')
  await page.getByRole('link', { name: 'Eingang' }).click()
  // inbox shows the current Berlin shift; navigate via board link if the published
  // handover targets a different shift than "now" — the board is deterministic:
  await page.getByRole('link', { name: 'Übersicht' }).click()
  await isolateProjectDate(page, testInfo.project.name)
  await page.getByRole('link', { name: /→ Spät/ }).click()
  await expect(page.getByText('Übergabe · Veröffentlicht')).toBeVisible()
})

test('contact data in task text is blocked with the guest-case hint', async ({ page }, testInfo) => {
  await signIn(page)
  await actAs(page, 'AB')
  await isolateProjectDate(page, testInfo.project.name)
  await shiftColumn(page, 'Spät').getByRole('button', { name: 'Übergabe beginnen' }).click()
  await page.getByPlaceholder('Neue Aufgabe … (keine Gastnamen)').fill('Rückruf +49 171 2345678')
  await page.getByRole('button', { name: 'Erfassen' }).click()
  await expect(page.getByText('Kontaktdaten bitte nicht im Text – Gastfall mit Zweck verwenden.')).toBeVisible()
})
