import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(here, '../tests/gantt'),
  testMatch: /recovery-cases-1-3-readonly\.spec\.ts/,
  // Never prune the repository-wide Playwright artifacts owned by other cases.
  outputDir: path.join(here, '../../.local/cases-1-3-readonly/test-results'),
  timeout: 300_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
})
