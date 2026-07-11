import { type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, unlock } from './fixtures'

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations).toEqual([])
}

async function captureTask(page: Page, text: string) {
  await page.getByLabel('Kürzel').fill('AB')
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill(text)
  await page.getByRole('button', { name: 'Erfassen' }).click()
}

test('PIN entry has no WCAG A/AA axe violations', async ({ page }) => {
  await page.goto('/pilot.html')
  await expect(page.getByLabel('PIN')).toBeVisible()
  await expectNoViolations(page)
})

test('unlocked capture details have no WCAG A/AA axe violations', async ({ page }) => {
  await unlock(page)
  await page.getByLabel('Neue Aufgabe, keine Gastnamen').fill('Minibar prüfen')
  await expect(page.getByLabel('Zimmer oder Referenz')).toBeVisible()
  await expectNoViolations(page)
})

test('completed dark-mode UI has no WCAG A/AA axe violations', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await unlock(page)
  await captureTask(page, 'Minibar prüfen')

  const task = page.getByRole('listitem').filter({ hasText: 'Minibar prüfen' })
  await task.getByRole('button', { name: 'Als erledigt markieren' }).click()
  await page.getByRole('button', { name: 'Erledigt (1)' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Wieder öffnen' })).toBeVisible()
  await expectNoViolations(page)
})
