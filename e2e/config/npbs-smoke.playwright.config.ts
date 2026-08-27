import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.resolve(here, '../tests'),
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
  reporter: [['line']],
  use: {
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'pbs-portal',
      testMatch: /tests\/pbs-portal\/npbs-crew-bids-simulation\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.PBS_PORTAL_BASE_URL ?? 'http://localhost:3030/pbs/',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: [],
  outputDir: path.resolve(here, '../results/npbs-smoke-test-results'),
})
