import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(__dirname, '../tests'),
  timeout: 45_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.GANTT_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'flair-altair-smoke',
      testMatch: /gantt\/flair-altair-login-smoke\.spec\.ts/,
    },
  ],
  outputDir: path.join(__dirname, '../results/test-results'),
})
