import { expect, test } from '@playwright/test'

test('app boots and shows wordmark', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Lobby Ledger')).toBeVisible()
})
