import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Case 2 standby-pool (>= 7 executable reserves + GH cost spread) — real Live UI validation. */
export default defineConfig({
  testDir: path.join(__dirname, '../tests/gantt'),
  testMatch: /recovery-case-002-standby\.spec\.ts/,
  timeout: 900_000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5567',
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
})
