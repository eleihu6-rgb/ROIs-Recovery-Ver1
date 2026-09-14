import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(here, '../tests/gantt'),
  testMatch: /recovery-case-004\.spec\.ts/,
  timeout: 900_000,
  outputDir: path.resolve(here, '../../.local/case4-e2e'),
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
