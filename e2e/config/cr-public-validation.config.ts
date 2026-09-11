import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLocalEnv } from './load-env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Public sign-off gate: run the FULL Gantt e2e suite against the public cr.rois.one
// tunnel binding (real UI, real login). Unlike the environment-neutral
// playwright.config.ts, this config INTENTIONALLY defaults to cr.rois.one — it exists
// only for that target, so no personal .env is required to use it. loadLocalEnv() still
// runs first so an explicit GANTT_BASE_URL/CI value can retarget it if ever needed.
loadLocalEnv()
const ganttBase = process.env.GANTT_BASE_URL ?? 'https://cr.rois.one'
// auth.setup.ts and gantt-hook.ts read GANTT_API_URL directly — keep it on the same
// public origin so login and in-test API calls hit cr.rois.one, not localhost:3000.
if (!process.env.GANTT_API_URL) process.env.GANTT_API_URL = ganttBase

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: ganttBase,
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
      testMatch: /tests\/gantt\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ganttBase,
        storageState: path.join(__dirname, '../results/.auth/gantt-admin.json'),
      },
      dependencies: ['cr-public-setup'],
    },
    {
      name: 'cr-public-setup',
      testMatch: /tests\/gantt\/.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ganttBase,
        ignoreHTTPSErrors: true,
      },
    },
  ],
  outputDir: path.join(__dirname, '../results/test-results'),
})
