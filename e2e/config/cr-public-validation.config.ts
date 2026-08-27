import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// One-off validation run against the public cr.rois.one tunnel binding.
// Reuses the existing real-user-login spec (real UI form login, no API-injection shortcut).
export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'https://cr.rois.one',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'cr-public-validation',
      testMatch: /gantt\/real-user-login\.spec\.ts/,
    },
  ],
  outputDir: path.join(__dirname, '../results/test-results'),
})
