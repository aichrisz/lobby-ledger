import { expect, test } from '@playwright/test'
import { makeTask, seed } from './fixtures'

test('print media shows only the brief on white paper', async ({ page }) => {
  await seed(page, [
    makeTask({ priority: 'wichtig' }),
    makeTask({ text: 'Extra Kissen gewünscht', ref: '310', department: 'housekeeping' }),
  ])
  await page.goto('/#/uebergabe')
  await expect(page.getByRole('heading', { name: 'Übergabe' })).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.header')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Drucken' })).toBeHidden()
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(255, 255, 255)')
  await page.setViewportSize({ width: 794, height: 1123 }) // A4 @ 96dpi
  await page.screenshot({ path: `test-results/screens/print-a4-${test.info().project.name}.png`, fullPage: true })
})
