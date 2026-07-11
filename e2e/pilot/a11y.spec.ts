import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations).toEqual([])
}

test('sign-in, board, and inbox have zero axe violations', async ({ page }) => {
  await page.goto('/pilot.html')
  await expectNoViolations(page)
  await page.getByLabel('E-Mail').fill('pilot@example.test')
  await page.getByLabel('Passwort').fill('local-dev-only-password')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByText('Übergaben')).toBeVisible()
  await expectNoViolations(page)
  await page.getByRole('link', { name: 'Eingang' }).click()
  await expectNoViolations(page)
})
