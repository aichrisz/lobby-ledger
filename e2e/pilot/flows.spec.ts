import { expect, test, unlock } from './fixtures'

test('unlocks the private Simple Pilot with the E2E PIN fixture', async ({ page }) => {
  await unlock(page)
  await expect(page.getByText('0 offen')).toBeVisible()
})

test('keeps a detailed task in its selected date and shift through status and deletion', async ({ page }) => {
  await unlock(page)
  const date = page.getByLabel('Datum')
  const today = await date.inputValue()

  await page.getByLabel('Kürzel').fill('ab')
  await page.locator('.shift-option').filter({ hasText: 'Spät' }).click()
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Minibar prüfen')
  await page.getByLabel('Zimmer oder Referenz').fill('204')
  await page.getByText('Housekeeping', { exact: true }).click()
  await page.locator('.priority-toggle').click()
  await page.getByRole('button', { name: 'Erfassen' }).click()

  const task = page.getByRole('listitem').filter({ hasText: 'Minibar prüfen' })
  await expect(task).toContainText('204')
  await expect(task).toContainText('Housekeeping · Wichtig')

  await page.getByRole('button', { name: 'Vorheriger Tag' }).click()
  await expect(date).not.toHaveValue(today)
  await expect(page.getByText('Noch keine Aufgaben für diesen Tag.')).toBeVisible()
  await page.getByRole('button', { name: 'Nächster Tag' }).click()
  await expect(date).toHaveValue(today)
  await expect(task).toBeVisible()

  await page.locator('.shift-option').filter({ hasText: 'Nacht' }).click()
  await expect(page.getByText('Noch keine Aufgaben für diesen Tag.')).toBeVisible()
  await page.locator('.shift-option').filter({ hasText: 'Spät' }).click()
  await expect(task).toBeVisible()

  await task.getByRole('button', { name: 'Als erledigt markieren' }).click()
  await expect(page.getByRole('button', { name: 'Erledigt (1)' })).toBeVisible()
  await page.getByRole('button', { name: 'Erledigt (1)' }).click()
  await expect(page.getByRole('button', { name: 'Aufgabe löschen' })).toBeVisible()
  await page.getByRole('button', { name: 'Aufgabe löschen' }).click()
  await expect(page.getByText('Noch keine Aufgaben für diesen Tag.')).toBeVisible()
})

test('renders the browser mock contact-data error path from task capture', async ({ page }) => {
  await unlock(page)
  await page.getByLabel('Kürzel').fill('AB')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Rückruf mail@example.test')
  await page.getByRole('button', { name: 'Erfassen' }).click()

  await expect(page.getByRole('status')).toHaveText('Kontaktdaten gehören nicht in Aufgaben')
  await expect(page.getByText('Noch keine Aufgaben für diesen Tag.')).toBeVisible()
})

test('uses the system theme until an explicit override is selected', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await unlock(page)

  const control = page.getByRole('button', { name: /Darstellung:/ })
  await expect(control).toHaveText('Darstellung: System')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await control.click()
  await expect(control).toHaveText('Darstellung: Dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await control.click()
  await expect(control).toHaveText('Darstellung: Hell')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await control.click()
  await expect(control).toHaveText('Darstellung: System')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
