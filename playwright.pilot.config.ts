import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e/pilot',
  webServer: {
    command: 'npm run build:pilot && npm run preview:pilot',
    url: 'http://localhost:4174/pilot.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4174' },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
})
