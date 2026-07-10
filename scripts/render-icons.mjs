import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('public/icons/icon.svg', 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage()
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>*{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`,
  )
  writeFileSync(`public/icons/icon-${size}.png`, await page.locator('svg').screenshot())
}
await browser.close()
console.log('wrote public/icons/icon-192.png and icon-512.png')
