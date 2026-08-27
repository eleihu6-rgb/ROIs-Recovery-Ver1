import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(__dirname, '../tests/perf'),
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
